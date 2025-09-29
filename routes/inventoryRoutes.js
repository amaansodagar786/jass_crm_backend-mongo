const express = require("express");
const router = express.Router();
const Inventory = require("../models/inventory");
const Product = require("../models/product");
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// Get all inventory with product details
router.get("/get-inventory", async (req, res) => {
    try {
        const inventory = await Inventory.find({}).sort({ createdAt: -1 });

        // Enrich with product details
        const enrichedInventory = await Promise.all(
            inventory.map(async (item) => {
                const product = await Product.findOne({ productId: item.productId });
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
                    batches: item.batches,
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
            message: "Failed to fetch inventory",
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
                // Updated column names
                const productName = row['Product Name'];
                const batchNumber = row['Batch Number'];
                const quantity = row['Quantity'];
                const manufactureDate = row['Manufacture Date'];

                console.log(`Processing row ${index + 2}:`, {
                    productName,
                    batchNumber,
                    quantity,
                    manufactureDate
                });

                if (!productName || !batchNumber || !quantity || !manufactureDate) {
                    errors.push(`Row ${index + 2}: Missing required fields. Found: ${JSON.stringify(row)}`);
                    continue;
                }

                // Find product - use exact match
                const product = allProducts.find(p =>
                    p.productName.trim().toLowerCase() === productName.trim().toLowerCase()
                );

                if (!product) {
                    errors.push(`Row ${index + 2}: Product "${productName}" not found.`);
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
                    b => b.batchNumber === batchNumber
                );

                if (existingBatch) {
                    errors.push(`Row ${index + 2}: Batch "${batchNumber}" already exists for product "${productName}"`);
                    continue;
                }

                // Calculate expiry date (36 months from manufacture)
                const manufacture = new Date(manufactureDate);
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

                await inventoryItem.save();
                console.log(`Added batch ${batchNumber} to product ${product.productName}`);
                addedBatches++;
            } catch (error) {
                console.error(`Error processing row ${index + 2}:`, error);
                errors.push(`Row ${index + 2}: ${error.message}`);
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        console.log(`Bulk upload completed. Added ${addedBatches} batches. Errors: ${errors.length}`);

        res.status(200).json({
            success: true,
            message: `Bulk upload completed. Added ${addedBatches} batches.`,
            addedBatches,
            errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
            totalErrors: errors.length
        });

    } catch (error) {
        console.error("Error in bulk upload:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process bulk upload",
            error: error.message
        });
    }
});

module.exports = router;