const express = require("express");
const router = express.Router();
const Inventory = require("../models/inventory");
const Product = require("../models/product");
const ProductDisposal = require("../models/ProductDisposal");
const InventoryCleanupService = require("../routes/inventoryCleanupService");
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// Get all inventory with product details

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

                // Enrich batches with disposal info INCLUDING PRICE
                const enrichedBatches = item.batches.map(batch => {
                    const disposals = batchDisposals[batch.batchNumber] || [];
                    const totalDisposedFromBatch = disposals.reduce((sum, d) => sum + d.quantity, 0);

                    return {
                        ...batch.toObject(),
                        disposals: disposals,
                        totalDisposed: totalDisposedFromBatch,
                        currentQuantity: batch.quantity,
                        originalQuantity: batch.quantity + totalDisposedFromBatch,
                        price: batch.price // INCLUDE PRICE IN RESPONSE
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
                    priceHistory: item.priceHistory || [],
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

router.post("/add-batches", async (req, res) => {
    try {
        console.log("🔍 ADD-BATCHES REQUEST BODY:", req.body);

        const { productId, batches, price, userDetails } = req.body; // ✅ ADDED userDetails

        if (!productId || !Array.isArray(batches) || !price) {
            console.log("❌ VALIDATION FAILED - Missing required fields");
            return res.status(400).json({
                success: false,
                message: "Product ID, batches array, and price are required"
            });
        }

        // ✅ ADD USER LOGGING FOR REQUEST
        console.log('👤 ADD BATCHES REQUEST BY:', {
            user: userDetails ? `${userDetails.name} (${userDetails.email})` : 'Unknown User',
            productId: productId,
            batchesCount: batches.length,
            price: price,
            timestamp: new Date().toISOString()
        });

        // Find the product
        const product = await Product.findOne({ productId });
        if (!product) {
            console.log("❌ PRODUCT NOT FOUND:", productId);
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        console.log("✅ PRODUCT FOUND:", product.productName);

        // Find or create inventory entry
        let inventoryItem = await Inventory.findOne({ productId });
        console.log("📦 INVENTORY ITEM:", inventoryItem ? "Found" : "Creating new");

        if (!inventoryItem) {
            inventoryItem = new Inventory({
                productId: product.productId,
                productName: product.productName,
                category: product.category,
                priceHistory: [],
                batches: []
            });
        }

        let addedBatches = 0;
        let updatedBatches = 0;
        const errors = [];
        const newBatchNumbers = [];
        const batchDetails = []; // ✅ FOR LOGGING

        console.log("🔄 PROCESSING BATCHES:", batches);

        // Process batches
        for (const batch of batches) {
            try {
                console.log("   Processing batch:", batch.batchNumber);

                // Validate required fields
                if (!batch.batchNumber || !batch.quantity || !batch.manufactureDate) {
                    errors.push({
                        batchNumber: batch.batchNumber || 'N/A',
                        message: "Missing required fields",
                        details: "Batch Number, Quantity, and Manufacture Date are required"
                    });
                    continue;
                }

                // Parse year-month format (YYYY-MM) to Date object (first day of month)
                const manufactureDate = new Date(batch.manufactureDate + '-01');
                if (isNaN(manufactureDate.getTime())) {
                    errors.push({
                        batchNumber: batch.batchNumber,
                        message: "Invalid manufacture date format",
                        details: `Expected YYYY-MM format, got: ${batch.manufactureDate}`
                    });
                    continue;
                }

                // Calculate expiry date (36 months from manufacture)
                const expiryDate = new Date(manufactureDate);
                expiryDate.setMonth(expiryDate.getMonth() + 36);

                console.log("   Manufacture Date:", manufactureDate);
                console.log("   Expiry Date:", expiryDate);

                const existingBatchIndex = inventoryItem.batches.findIndex(
                    b => b.batchNumber === batch.batchNumber
                );

                if (existingBatchIndex !== -1) {
                    // Compare only year and month for existing batches
                    const newManufacture = manufactureDate.toISOString().substring(0, 7); // YYYY-MM
                    const existingManufacture = new Date(inventoryItem.batches[existingBatchIndex].manufactureDate)
                        .toISOString().substring(0, 7);

                    console.log("   New Manufacture:", newManufacture, "Existing:", existingManufacture);

                    if (newManufacture !== existingManufacture) {
                        console.log("   ❌ DIFFERENT MANUFACTURE DATE");
                        errors.push({
                            batchNumber: batch.batchNumber,
                            message: "Batch already exists with different manufacture date",
                            details: `Existing manufacture date: ${existingManufacture}, New manufacture date: ${newManufacture}`
                        });
                        continue;
                    } else {
                        console.log("   ✅ SAME DATE - UPDATING QUANTITY");
                        const oldQuantity = inventoryItem.batches[existingBatchIndex].quantity;
                        inventoryItem.batches[existingBatchIndex].quantity += parseInt(batch.quantity);
                        updatedBatches++;

                        // ✅ ADD BATCH DETAIL FOR LOGGING
                        batchDetails.push({
                            batchNumber: batch.batchNumber,
                            action: 'UPDATED',
                            oldQuantity: oldQuantity,
                            newQuantity: inventoryItem.batches[existingBatchIndex].quantity,
                            quantityAdded: parseInt(batch.quantity),
                            manufactureDate: newManufacture
                        });

                        console.log(`✅ Updated existing batch ${batch.batchNumber} - Added ${batch.quantity} units`);
                    }
                } else {
                    console.log("   ✅ NEW BATCH - ADDING");
                    const newBatch = {
                        batchNumber: batch.batchNumber,
                        quantity: parseInt(batch.quantity),
                        manufactureDate: manufactureDate,
                        expiryDate: expiryDate,
                        addedAt: new Date()
                    };

                    inventoryItem.batches.push(newBatch);
                    newBatchNumbers.push(batch.batchNumber);
                    addedBatches++;

                    // ✅ ADD BATCH DETAIL FOR LOGGING
                    batchDetails.push({
                        batchNumber: batch.batchNumber,
                        action: 'ADDED',
                        quantity: parseInt(batch.quantity),
                        manufactureDate: manufactureDate.toISOString().substring(0, 7),
                        expiryDate: expiryDate.toISOString().substring(0, 7)
                    });

                    console.log(`✅ Added new batch ${batch.batchNumber} with ${batch.quantity} units`);
                }
            } catch (batchError) {
                console.error(`Error processing batch ${batch.batchNumber}:`, batchError);
                errors.push({
                    batchNumber: batch.batchNumber || 'N/A',
                    message: "Batch processing error",
                    details: batchError.message
                });
            }
        }

        console.log("📊 BATCH PROCESSING RESULTS:");
        console.log("   Added:", addedBatches, "Updated:", updatedBatches, "Errors:", errors.length);

        // ADD PRICE TO HISTORY (only for newly added batches, not updated ones)
        if (addedBatches > 0) {
            const totalQuantityAdded = batches
                .filter(batch => newBatchNumbers.includes(batch.batchNumber))
                .reduce((sum, batch) => sum + parseInt(batch.quantity), 0);

            inventoryItem.priceHistory.push({
                price: parseFloat(price),
                quantityAdded: totalQuantityAdded,
                batchNumbers: newBatchNumbers,
                addedAt: new Date()
            });
            console.log(`💰 Added price history: ${totalQuantityAdded} units @ ₹${price}`);
        }

        // ✅ FIX: Allow success even if only updates happened (no new batches)
        if (errors.length > 0 && addedBatches === 0 && updatedBatches === 0) {
            console.log("❌ ALL BATCHES FAILED VALIDATION");
            return res.status(400).json({
                success: false,
                message: "All batches failed validation",
                errors: errors
            });
        }

        await inventoryItem.save();
        console.log("💾 INVENTORY SAVED SUCCESSFULLY");

        // ✅ ADD COMPREHENSIVE USER LOGGING FOR SUCCESS
        console.log('📝 BATCHES ADDED/UPDATE SUCCESS:', {
            productId: productId,
            productName: product.productName,
            user: userDetails ? `${userDetails.name} (${userDetails.email})` : 'Unknown User',
            addedBatches: addedBatches,
            updatedBatches: updatedBatches,
            totalBatchesProcessed: addedBatches + updatedBatches,
            totalQuantityAdded: batchDetails.reduce((sum, batch) => sum + (batch.quantityAdded || batch.quantity || 0), 0),
            pricePerUnit: price,
            batchDetails: batchDetails,
            errorsCount: errors.length,
            timestamp: new Date().toISOString()
        });

        // ✅ FIX: Return success even if only updates happened
        let successMessage = "";
        if (addedBatches > 0 && updatedBatches > 0) {
            successMessage = `Batches processed successfully. Added: ${addedBatches}, Updated: ${updatedBatches}`;
        } else if (addedBatches > 0) {
            successMessage = `Batches added successfully. Added: ${addedBatches}`;
        } else if (updatedBatches > 0) {
            successMessage = `Batches updated successfully. Updated: ${updatedBatches}`;
        }

        console.log("🎯 SENDING SUCCESS RESPONSE:", successMessage);

        res.status(200).json({
            success: true,
            message: successMessage,
            addedBatches,
            updatedBatches,
            price: price,
            errors: errors.length > 0 ? errors : undefined,
            data: inventoryItem
        });

    } catch (error) {
        console.error("💥 ERROR IN ADD-BATCHES:", error);

        // ✅ ADD ERROR LOGGING WITH USER DETAILS
        console.error('❌ BATCH ADDITION FAILED:', {
            productId: req.body.productId,
            user: req.body.userDetails ? `${req.body.userDetails.name}` : 'Unknown User',
            error: error.message,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            message: "Failed to add batches",
            error: error.message
        });
    }
});

router.post("/bulk-upload-batches", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        console.log("Processing uploaded file:", req.file.path);

        let userDetails = null;
        if (req.body.userDetails) {
            try {
                userDetails = JSON.parse(req.body.userDetails);
            } catch (parseError) {
                console.error("Error parsing userDetails:", parseError);
            }
        }

        // ✅ ADD USER LOGGING FOR BULK UPLOAD START
        console.log('👤 BULK UPLOAD STARTED:', {
            user: userDetails ? `${userDetails.name} (${userDetails.email})` : 'Unknown User',
            userId: userDetails?.userId || 'Unknown',
            fileName: req.file.originalname,
            fileSize: req.file.size,
            timestamp: new Date().toISOString()
        });

        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        console.log("Excel data first row:", data[0]);

        let addedBatches = 0;
        let updatedBatches = 0;
        const errors = [];

        // Get all products first for better matching
        const allProducts = await Product.find({});
        console.log("Available products count:", allProducts.length);

        // Track price history for each product
        const productPriceHistory = {};

        for (const [index, row] of data.entries()) {
            try {
                const rowNumber = index + 2;
                const productName = row['Product Name'];
                const batchNumber = row['Batch Number'];
                const quantity = row['Quantity'];
                const manufactureDateInput = row['Manufacture Date'];
                const price = row['Price'];

                console.log(`Processing row ${rowNumber}:`, {
                    productName,
                    batchNumber,
                    quantity,
                    manufactureDateInput,
                    price
                });

                // Validate required fields including PRICE
                if (!productName || !batchNumber || !quantity || !manufactureDateInput || !price) {
                    const missingFields = [];
                    if (!productName) missingFields.push('Product Name');
                    if (!batchNumber) missingFields.push('Batch Number');
                    if (!quantity) missingFields.push('Quantity');
                    if (!manufactureDateInput) missingFields.push('Manufacture Date');
                    if (!price) missingFields.push('Price');

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

                // Validate price is a positive number
                if (isNaN(price) || parseFloat(price) <= 0) {
                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName,
                        batchNumber: batchNumber,
                        message: "Invalid price",
                        details: `Price must be a positive number, got: ${price}`
                    });
                    continue;
                }

                // Parse manufacture date (handle different formats)
                let manufactureDate;

                if (typeof manufactureDateInput === "number") {
                    // Handle Excel date numbers
                    const excelDate = XLSX.SSF.parse_date_code(manufactureDateInput);
                    manufactureDate = new Date(excelDate.y, excelDate.m - 1, 1);
                } else if (typeof manufactureDateInput === "string") {
                    // Handle string formats
                    if (manufactureDateInput.match(/^\d{4}-\d{2}$/)) {
                        // YYYY-MM format
                        manufactureDate = new Date(manufactureDateInput + '-01');
                    } else if (manufactureDateInput.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                        // MM/DD/YYYY format - extract year and month only
                        const [month, day, year] = manufactureDateInput.split('/');
                        manufactureDate = new Date(year, month - 1, 1);
                    } else {
                        // Try to parse as full date, then extract year-month
                        manufactureDate = new Date(manufactureDateInput);
                        if (!isNaN(manufactureDate.getTime())) {
                            // Set to first day of month
                            manufactureDate = new Date(manufactureDate.getFullYear(), manufactureDate.getMonth(), 1);
                        }
                    }
                }

                if (!manufactureDate || isNaN(manufactureDate.getTime())) {
                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName,
                        batchNumber: batchNumber,
                        message: "Invalid manufacture date",
                        details: `Manufacture date must be in YYYY-MM format, got: ${manufactureDateInput}`
                    });
                    continue;
                }

                // Validate manufacture date is not in the future
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (manufactureDate > today) {
                    errors.push({
                        rowNumber: rowNumber,
                        productName: productName,
                        batchNumber: batchNumber,
                        message: "Manufacture date cannot be in the future",
                        details: `Manufacture date: ${manufactureDate.toISOString().substring(0, 7)}`
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
                        details: `Product "${productName}" does not exist in the system.`
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
                        priceHistory: [],
                        batches: []
                    });
                    console.log(`Created new inventory for product: ${product.productName}`);
                }

                // Initialize price history tracking for this product
                if (!productPriceHistory[product.productId]) {
                    productPriceHistory[product.productId] = {
                        price: parseFloat(price),
                        quantityAdded: 0,
                        batchNumbers: []
                    };
                }

                // Calculate expiry date (36 months from manufacture)
                const expiryDate = new Date(manufactureDate);
                expiryDate.setMonth(expiryDate.getMonth() + 36);

                // Check if batch already exists with same manufacture month
                const existingBatchIndex = inventoryItem.batches.findIndex(
                    b => b.batchNumber === batchNumber.trim()
                );

                if (existingBatchIndex !== -1) {
                    const existingBatch = inventoryItem.batches[existingBatchIndex];
                    const newManufactureMonth = manufactureDate.toISOString().substring(0, 7); // YYYY-MM
                    const existingManufactureMonth = new Date(existingBatch.manufactureDate).toISOString().substring(0, 7);

                    if (newManufactureMonth !== existingManufactureMonth) {
                        errors.push({
                            rowNumber: rowNumber,
                            productName: productName,
                            batchNumber: batchNumber,
                            message: "Batch already exists with different manufacture date",
                            details: `Existing manufacture date: ${existingManufactureMonth}, New manufacture date: ${newManufactureMonth}`
                        });
                        continue;
                    } else {
                        // Same batch name and same manufacture month - update quantity
                        const oldQuantity = inventoryItem.batches[existingBatchIndex].quantity;
                        inventoryItem.batches[existingBatchIndex].quantity += parseInt(quantity);
                        updatedBatches++;
                        console.log(`Updated existing batch ${batchNumber} for product ${product.productName}`);
                    }
                } else {
                    // Add new batch
                    inventoryItem.batches.push({
                        batchNumber: batchNumber.trim(),
                        quantity: parseInt(quantity),
                        manufactureDate: manufactureDate,
                        expiryDate: expiryDate,
                        addedAt: new Date()
                    });

                    // Track for price history
                    productPriceHistory[product.productId].quantityAdded += parseInt(quantity);
                    productPriceHistory[product.productId].batchNumbers.push(batchNumber.trim());

                    addedBatches++;
                    console.log(`Added new batch ${batchNumber} to product ${product.productName}`);
                }

                // Update total quantity
                inventoryItem.totalQuantity = inventoryItem.batches.reduce((sum, batch) => sum + batch.quantity, 0);

                await inventoryItem.save();

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

        // ADD PRICE HISTORY FOR ALL PRODUCTS AFTER PROCESSING ALL ROWS
        for (const [productId, priceData] of Object.entries(productPriceHistory)) {
            if (priceData.quantityAdded > 0) {
                const inventoryItem = await Inventory.findOne({ productId: productId });
                if (inventoryItem) {
                    inventoryItem.priceHistory.push({
                        price: priceData.price,
                        quantityAdded: priceData.quantityAdded,
                        batchNumbers: priceData.batchNumbers,
                        addedAt: new Date()
                    });
                    await inventoryItem.save();
                    console.log(`Added price history for product ${productId}: ${priceData.quantityAdded} units @ ₹${priceData.price}`);
                }
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        console.log(`Bulk upload completed. Added: ${addedBatches} batches, Updated: ${updatedBatches} batches. Errors: ${errors.length}`);

        // ✅ ADD COMPREHENSIVE USER LOGGING FOR BULK UPLOAD SUCCESS
        console.log('📝 BULK UPLOAD COMPLETED:', {
            user: userDetails ? `${userDetails.name} (${userDetails.email})` : 'Unknown User',
            fileName: req.file.originalname,
            totalRows: data.length,
            addedBatches: addedBatches,
            updatedBatches: updatedBatches,
            totalBatchesProcessed: addedBatches + updatedBatches,
            errorsCount: errors.length,
            productsAffected: Object.keys(productPriceHistory).length,
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            success: true,
            message: `Bulk upload completed. Added: ${addedBatches}, Updated: ${updatedBatches}, Errors: ${errors.length}`,
            addedBatches,
            updatedBatches,
            errors: errors,
            totalErrors: errors.length
        });

    } catch (error) {
        console.error("Error in bulk upload:", error);

        // ✅ ADD ERROR LOGGING WITH USER DETAILS
        console.error('❌ BULK UPLOAD FAILED:', {
            user: req.body.userDetails ? `${req.body.userDetails.name}` : 'Unknown User',
            fileName: req.file?.originalname || 'Unknown',
            error: error.message,
            timestamp: new Date().toISOString()
        });

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


// Run automated cleanup
router.post("/run-cleanup", async (req, res) => {
    try {
        const results = await InventoryCleanupService.performCleanup();

        res.status(200).json({
            success: true,
            message: `Cleanup completed successfully`,
            data: results
        });

    } catch (error) {
        console.error("Cleanup error:", error);
        res.status(500).json({
            success: false,
            message: "Cleanup failed",
            error: error.message
        });
    }
});

// Get cleanup statistics
router.get("/cleanup-stats", async (req, res) => {
    try {
        const stats = await InventoryCleanupService.getCleanupStats();

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to get cleanup stats",
            error: error.message
        });
    }
});



module.exports = router;