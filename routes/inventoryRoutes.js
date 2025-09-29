const express = require("express");
const router = express.Router();
const Inventory = require("../models/inventory");
const Product = require("../models/product");
const ProductDisposal = require("../models/ProductDisposal");
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// Get all inventory with product details
// Get all inventory with product details and disposal info
router.get("/get-inventory", async (req, res) => {
    try {
        const inventory = await Inventory.find({}).sort({ createdAt: -1 });

        // Enrich with product details and disposal info
        const enrichedInventory = await Promise.all(
            inventory.map(async (item) => {
                const product = await Product.findOne({ productId: item.productId });

                // Get ALL disposal records for this product
                const disposalRecords = await ProductDisposal.find({
                    productId: item.productId
                });

                // Create a map of batch disposals - aggregate all disposals for each batch
                const batchDisposals = {};
                let totalProductDisposed = 0;

                disposalRecords.forEach(record => {
                    record.batches.forEach(disposalBatch => {
                        if (!batchDisposals[disposalBatch.batchNumber]) {
                            batchDisposals[disposalBatch.batchNumber] = [];
                        }
                        batchDisposals[disposalBatch.batchNumber].push({
                            type: record.type,
                            quantity: disposalBatch.quantity,
                            reason: record.reason,
                            disposalDate: record.disposalDate,
                            disposalId: record.disposalId
                        });

                        totalProductDisposed += disposalBatch.quantity;
                    });
                });

                // Enrich batches with disposal info
                const enrichedBatches = item.batches.map(batch => {
                    const disposals = batchDisposals[batch.batchNumber] || [];
                    const totalDisposedFromBatch = disposals.reduce((sum, d) => sum + d.quantity, 0);

                    return {
                        ...batch.toObject(),
                        disposals: disposals,
                        totalDisposed: totalDisposedFromBatch,
                        currentQuantity: batch.quantity,
                        originalQuantity: batch.quantity + totalDisposedFromBatch
                    };
                });

                return {
                    inventoryId: item.inventoryId,
                    productId: item.productId,
                    productName: item.productName,
                    category: item.category,
                    hsnCode: product?.hsnCode || "-",
                    price: product?.price || 0,
                    taxSlab: product?.taxSlab || 0,
                    discount: product?.discount || 0,
                    totalQuantity: item.totalQuantity,
                    batches: enrichedBatches,
                    totalDisposed: totalProductDisposed,
                    status: item.totalQuantity === 0 ? "Out of Stock" :
                        item.totalQuantity <= 10 ? "Low Stock" : "In Stock",
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt
                };
            })
        );

        res.status(200).json({
            success: true,
            data: enrichedInventory
        });
    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch inventory data",
            error: error.message
        });
    }
});

// Add batches to product
router.post("/add-batches", async (req, res) => {
    try {
        const { productId, batches } = req.body;

        if (!productId || !Array.isArray(batches)) {
            return res.status(400).json({
                success: false,
                message: "Product ID and batches array are required"
            });
        }

        // Find the product
        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Find or create inventory entry
        let inventoryItem = await Inventory.findOne({ productId });

        if (!inventoryItem) {
            inventoryItem = new Inventory({
                productId: product.productId,
                productName: product.productName,
                category: product.category,
                batches: []
            });
        }

        // Add new batches with both manufacture and expiry dates
        const newBatches = batches.map(batch => ({
            batchNumber: batch.batchNumber,
            quantity: batch.quantity,
            manufactureDate: new Date(batch.manufactureDate),
            expiryDate: new Date(batch.expiryDate),
            addedAt: new Date()
        }));

        inventoryItem.batches.push(...newBatches);
        await inventoryItem.save();

        res.status(200).json({
            success: true,
            message: "Batches added successfully",
            data: inventoryItem
        });
    } catch (error) {
        console.error("Error adding batches:", error);
        res.status(500).json({
            success: false,
            message: "Failed to add batches",
            error: error.message
        });
    }
});

// Bulk upload batches from Excel

router.post("/bulk-upload-batches", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        console.log("Processing uploaded file:", req.file.path);

        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        console.log("Excel data first row:", data[0]);

        let addedBatches = 0;
        const errors = [];

        // Get all products first for better matching
        const allProducts = await Product.find({});
        console.log("Available products count:", allProducts.length);

        for (const [index, row] of data.entries()) {
            try {
                const rowNumber = index + 2; // +2 because Excel rows start at 1 and header is row 1
                const productName = row['Product Name'];
                const batchNumber = row['Batch Number'];
                const quantity = row['Quantity'];
                const manufactureDate = row['Manufacture Date'];

                console.log(`Processing row ${rowNumber}:`, {
                    productName,
                    batchNumber,
                    quantity,
                    manufactureDate
                });

                // Validate required fields with structured errors
                if (!productName || !batchNumber || !quantity || !manufactureDate) {
                    const missingFields = [];
                    if (!productName) missingFields.push('Product Name');
                    if (!batchNumber) missingFields.push('Batch Number');
                    if (!quantity) missingFields.push('Quantity');
                    if (!manufactureDate) missingFields.push('Manufacture Date');

                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName || 'N/A',
                        batchNumber: batchNumber || 'N/A',
                        message: `Missing required fields: ${missingFields.join(', ')}`,
                        details: `Row data: ${JSON.stringify(row)}`
                    });
                    continue;
                }

                // Validate quantity is a positive number
                if (isNaN(quantity) || parseInt(quantity) <= 0) {
                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName,
                        batchNumber: batchNumber,
                        message: "Invalid quantity",
                        details: `Quantity must be a positive number, got: ${quantity}`
                    });
                    continue;
                }

                // Validate manufacture date
                const manufacture = new Date(manufactureDate);
                if (isNaN(manufacture.getTime())) {
                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName,
                        batchNumber: batchNumber,
                        message: "Invalid manufacture date",
                        details: `Manufacture date must be a valid date, got: ${manufactureDate}`
                    });
                    continue;
                }

                // Find product - use exact match
                const product = allProducts.find(p =>
                    p.productName.trim().toLowerCase() === productName.trim().toLowerCase()
                );

                if (!product) {
                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName,
                        batchNumber: batchNumber,
                        message: "Product not found",
                        details: `Product "${productName}" does not exist in the system. Available products: ${allProducts.map(p => p.productName).join(', ')}`
                    });
                    continue;
                }

                console.log(`Found product: ${product.productName} with ID: ${product.productId}`);

                // Find or create inventory
                let inventoryItem = await Inventory.findOne({ productId: product.productId });

                if (!inventoryItem) {
                    inventoryItem = new Inventory({
                        productId: product.productId,
                        productName: product.productName,
                        category: product.category,
                        batches: []
                    });
                    console.log(`Created new inventory for product: ${product.productName}`);
                }

                // Check if batch already exists
                const existingBatch = inventoryItem.batches.find(
                    b => b.batchNumber === batchNumber.trim()
                );

                if (existingBatch) {
                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName,
                        batchNumber: batchNumber,
                        message: "Batch number already exists",
                        details: `Batch "${batchNumber}" already exists for product "${productName}"`
                    });
                    continue;
                }

                // Calculate expiry date (36 months from manufacture)
                const expiry = new Date(manufacture);
                expiry.setMonth(expiry.getMonth() + 36);

                // Add batch
                inventoryItem.batches.push({
                    batchNumber: batchNumber.trim(),
                    quantity: parseInt(quantity),
                    manufactureDate: manufacture,
                    expiryDate: expiry,
                    addedAt: new Date()
                });

                // Update total quantity
                inventoryItem.totalQuantity = inventoryItem.batches.reduce((sum, batch) => sum + batch.quantity, 0);

                // Update status based on total quantity
                if (inventoryItem.totalQuantity === 0) {
                    inventoryItem.status = "Out of Stock";
                } else if (inventoryItem.totalQuantity <= 10) {
                    inventoryItem.status = "Low Stock";
                } else {
                    inventoryItem.status = "In Stock";
                }

                await inventoryItem.save();
                console.log(`Added batch ${batchNumber} to product ${product.productName}`);
                addedBatches++;

            } catch (error) {
                console.error(`Error processing row ${index + 2}:`, error);
                errors.push({
                    rowNumber: index + 2,
                    productName: row['Product Name'] || 'N/A',
                    batchNumber: row['Batch Number'] || 'N/A',
                    message: "Processing error",
                    details: error.message
                });
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        console.log(`Bulk upload completed. Added ${addedBatches} batches. Errors: ${errors.length}`);

        res.status(200).json({
            success: true,
            message: `Bulk upload completed. Added ${addedBatches} batches with ${errors.length} errors.`,
            addedBatches,
            errors: errors, // Send all structured errors
            totalErrors: errors.length
        });

    } catch (error) {
        console.error("Error in bulk upload:", error);

        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: "Failed to process bulk upload",
            error: error.message,
            errors: [{
                rowNumber: 0,
                productName: 'N/A',
                batchNumber: 'N/A',
                message: "System error",
                details: error.message
            }]
        });
    }
});


// Dispose products (defective or expired)


// Dispose products (defective or expired)
router.post("/dispose-product", async (req, res) => {
    try {
        const { productId, type, batchNumber, quantity, reason, batches, disposalDate } = req.body;

        if (!productId || !type) {
            return res.status(400).json({
                success: false,
                message: "Product ID and disposal type are required"
            });
        }

        // Find the product and inventory
        const product = await Product.findOne({ productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const inventoryItem = await Inventory.findOne({ productId });
        if (!inventoryItem) {
            return res.status(404).json({
                success: false,
                message: "Inventory item not found"
            });
        }

        let totalQuantityDisposed = 0;
        const disposedBatches = [];

        if (type === "defective") {
            // Handle defective disposal
            if (!batchNumber || !quantity || !reason) {
                return res.status(400).json({
                    success: false,
                    message: "Batch number, quantity, and reason are required for defective disposal"
                });
            }

            // Find the batch
            const batchIndex = inventoryItem.batches.findIndex(b => b.batchNumber === batchNumber);
            if (batchIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: "Batch not found"
                });
            }

            const batch = inventoryItem.batches[batchIndex];
            if (batch.quantity < quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient quantity in batch. Available: ${batch.quantity}`
                });
            }

            // Update batch quantity
            inventoryItem.batches[batchIndex].quantity -= parseInt(quantity);
            totalQuantityDisposed = parseInt(quantity);

            disposedBatches.push({
                batchNumber: batch.batchNumber,
                quantity: parseInt(quantity),
                manufactureDate: batch.manufactureDate,
                expiryDate: batch.expiryDate
            });

        } else if (type === "expired") {
            // Handle expired disposal
            if (!batches || !Array.isArray(batches) || batches.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Batches array is required for expired disposal"
                });
            }

            for (const disposalBatch of batches) {
                const batchIndex = inventoryItem.batches.findIndex(b => b.batchNumber === disposalBatch.batchNumber);
                if (batchIndex !== -1) {
                    const batch = inventoryItem.batches[batchIndex];
                    const quantityToRemove = disposalBatch.quantity;

                    if (batch.quantity >= quantityToRemove) {
                        inventoryItem.batches[batchIndex].quantity -= quantityToRemove;
                        totalQuantityDisposed += quantityToRemove;

                        disposedBatches.push({
                            batchNumber: batch.batchNumber,
                            quantity: quantityToRemove,
                            manufactureDate: batch.manufactureDate,
                            expiryDate: batch.expiryDate
                        });
                    }
                }
            }

            if (totalQuantityDisposed === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No batches were disposed"
                });
            }
        }

        // Remove batches with zero quantity
        inventoryItem.batches = inventoryItem.batches.filter(batch => batch.quantity > 0);

        // Save updated inventory
        await inventoryItem.save();

        // Create disposal record
        const disposalRecord = new ProductDisposal({
            productId: product.productId,
            productName: product.productName,
            category: product.category,
            type: type,
            batches: disposedBatches,
            reason: type === 'defective' ? reason : 'Expired',
            totalQuantityDisposed: totalQuantityDisposed,
            disposalDate: disposalDate || new Date()
        });

        await disposalRecord.save();

        res.status(200).json({
            success: true,
            message: `Products disposed successfully. Total quantity: ${totalQuantityDisposed}`,
            data: {
                disposalRecord,
                updatedInventory: inventoryItem
            }
        });

    } catch (error) {
        console.error("Error disposing products:", error);
        res.status(500).json({
            success: false,
            message: "Failed to dispose products",
            error: error.message
        });
    }
});

// Get disposal history
// Get disposal history
router.get("/disposal-history", async (req, res) => {
    try {
        const { productId, type, startDate, endDate, page = 1, limit = 50 } = req.query;

        let query = {};
        if (productId) query.productId = productId;
        if (type) query.type = type;

        // Fix date filtering
        if (startDate || endDate) {
            query.disposalDate = {};
            if (startDate) {
                query.disposalDate.$gte = new Date(startDate);
            }
            if (endDate) {
                query.disposalDate.$lte = new Date(endDate);
            }
        }

        const disposals = await ProductDisposal.find(query)
            .sort({ disposalDate: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await ProductDisposal.countDocuments(query);

        res.status(200).json({
            success: true,
            data: disposals,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });

    } catch (error) {
        console.error("Error fetching disposal history:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch disposal history",
            error: error.message
        });
    }
});



module.exports = router;