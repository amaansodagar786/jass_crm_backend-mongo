const express = require("express");
const router = express.Router();
const Product = require("../models/product"); // Updated path
const Inventory = require("../models/inventory");

// Helper function to create inventory entry
const createInventoryEntry = async (product) => {
    const inventoryEntry = new Inventory({
        productId: product.productId,
        productName: product.productName,
        category: product.category,
        batches: [], // Empty batches array initially
        totalQuantity: 0
    });

    await inventoryEntry.save();
    return inventoryEntry;
};

// Create Product (Updated with Inventory)
router.post("/create-product", async (req, res) => {
    try {
        const { productName, barcode } = req.body;

        // Check for existing product name
        const existingByName = await Product.findOne({ productName });
        if (existingByName) {
            return res.status(400).json({
                message: "Product with this name already exists",
                field: "productName"
            });
        }

        // Create product
        const product = new Product({
            ...req.body,
            discount: req.body.discount || 0,
            category: req.body.category
        });

        const savedProduct = await product.save();

        // Create inventory entry for the new product
        await createInventoryEntry(savedProduct);

        res.status(201).json(savedProduct.toObject());
    } catch (error) {
        console.error("Error saving product:", error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: "Validation error",
                error: error.message
            });
        }

        res.status(500).json({
            message: "Error saving product",
            error: error.message
        });
    }
});

// Bulk Upload Products (Updated with Inventory)
router.post("/bulk-upload-products", async (req, res) => {
    try {
        const products = req.body;
        const results = { successful: [], failed: [] };

        for (const productData of products) {
            try {
                const { productName, category } = productData;

                if (!productName) {
                    results.failed.push({
                        product: productData,
                        reason: "Missing productName"
                    });
                    continue;
                }

                if (!category) {
                    results.failed.push({
                        product: productData,
                        reason: "Missing category"
                    });
                    continue;
                }

                // Normalize category to lowercase
                const normalizedCategory = category.toLowerCase();

                // Check for existing product name
                const existingByName = await Product.findOne({ productName });

                if (existingByName) {
                    results.failed.push({
                        product: productData,
                        reason: "Product with this name already exists"
                    });
                    continue;
                }

                // Normalize product data with lowercase category
                const cleanedData = {
                    ...productData,
                    category: normalizedCategory, // Use normalized category
                    barcode: productData.barcode || null,
                    hsnCode: productData.hsnCode || null,
                    taxSlab: productData.taxSlab ? Number(productData.taxSlab) : 0,
                    price: productData.price ? Number(productData.price) : 0,
                    discount: productData.discount ? Number(productData.discount) : 0,
                };

                const product = new Product(cleanedData);
                const savedProduct = await product.save();
                await createInventoryEntry(savedProduct);

                results.successful.push(savedProduct.toObject());
            } catch (error) {
                results.failed.push({
                    product: productData,
                    reason: error.message
                });
            }
        }

        res.status(200).json(results);
    } catch (error) {
        console.error("Error in bulk upload:", error);
        res.status(500).json({
            message: "Error processing bulk upload",
            error: error.message
        });
    }
});

// Get All Products
router.get("/get-products", async (req, res) => {
    try {
        const products = await Product.find({}).sort({ createdAt: -1 });

        // Convert to plain objects to match previous structure
        const plainProducts = products.map(product => product.toObject());

        res.status(200).json(plainProducts);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({
            message: "Error fetching products",
            error: error.message
        });
    }
});

// Update Product
// Update Product
router.put("/update-product/:productId", async (req, res) => {
    try {
        const { productId } = req.params;
        const { _id, createdAt, updatedAt, ...updateData } = req.body;

        if (updateData.category) {
            updateData.category = updateData.category.toLowerCase();
        }

        // Convert numeric fields to numbers
        if (updateData.taxSlab !== undefined) {
            updateData.taxSlab = Number(updateData.taxSlab);
        }
        if (updateData.price !== undefined) {
            updateData.price = Number(updateData.price);
        }
        if (updateData.discount !== undefined) {
            updateData.discount = Number(updateData.discount);
        }

        // Check if product name already exists (excluding current product)
        if (updateData.productName) {
            const existingProduct = await Product.findOne({
                productName: updateData.productName,
                productId: { $ne: productId }
            });

            if (existingProduct) {
                return res.status(400).json({
                    message: "Another product with this name already exists",
                    field: "productName"
                });
            }
        }

        // Update the product
        const updatedProduct = await Product.findOneAndUpdate(
            { productId: productId },
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // 🔹 Update inventory with new productName or category
        await Inventory.findOneAndUpdate(
            { productId: productId },
            {
                productName: updatedProduct.productName,
                category: updatedProduct.category
            }
        );

        res.status(200).json(updatedProduct.toObject());
    } catch (error) {
        console.error("Error updating product:", error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: "Validation error",
                error: error.message
            });
        }

        res.status(500).json({
            message: "Failed to update product",
            error: error.message
        });
    }
});


// Delete Product
// Delete Product
router.delete("/delete-product/:id", async (req, res) => {
    try {
        const deletedProduct = await Product.findOneAndDelete({
            productId: req.params.id
        });

        if (!deletedProduct) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // 🔹 Delete inventory entry as well
        await Inventory.findOneAndDelete({ productId: req.params.id });

        res.status(200).json({
            message: "Product and its inventory deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({
            message: "Failed to delete product",
            error: error.message
        });
    }
});




// Additional route to get product by ID if needed
router.get("/get-product/:id", async (req, res) => {
    try {
        const product = await Product.findOne({ productId: req.params.id });

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.status(200).json(product.toObject());
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({
            message: "Failed to fetch product",
            error: error.message
        });
    }
});

// Update discount for a single product
router.put("/update-discount/:productId", async (req, res) => {
    try {
        const { productId } = req.params;
        const { discount } = req.body;

        // Validate discount value
        if (discount === undefined || discount === null) {
            return res.status(400).json({
                message: "Discount value is required"
            });
        }

        const discountValue = Number(discount);
        if (isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
            return res.status(400).json({
                message: "Discount must be a number between 0 and 100"
            });
        }

        const updatedProduct = await Product.findOneAndUpdate(
            { productId: productId },
            { discount: discountValue },
            {
                new: true,
                runValidators: true
            }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.status(200).json({
            message: "Discount updated successfully",
            product: updatedProduct.toObject()
        });
    } catch (error) {
        console.error("Error updating discount:", error);
        res.status(500).json({
            message: "Failed to update discount",
            error: error.message
        });
    }
});

// Bulk update discounts for multiple products
router.put("/bulk-update-discounts", async (req, res) => {
    try {
        const { discounts } = req.body; // Array of { productId, discount }

        if (!Array.isArray(discounts) || discounts.length === 0) {
            return res.status(400).json({
                message: "Discounts array is required"
            });
        }

        const results = {
            successful: [],
            failed: []
        };

        // Validate all discounts first
        for (const item of discounts) {
            if (!item.productId) {
                results.failed.push({
                    productId: item.productId,
                    reason: "Product ID is required"
                });
                continue;
            }

            const discountValue = Number(item.discount);
            if (isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
                results.failed.push({
                    productId: item.productId,
                    reason: "Discount must be a number between 0 and 100"
                });
                continue;
            }
        }

        // If any validation failed, return early
        if (results.failed.length > 0) {
            return res.status(400).json({
                message: "Some discounts failed validation",
                results
            });
        }

        // Update all discounts
        const bulkOperations = discounts.map(item => ({
            updateOne: {
                filter: { productId: item.productId },
                update: { discount: Number(item.discount) }
            }
        }));

        const bulkResult = await Product.bulkWrite(bulkOperations);

        // Get updated products for response
        const productIds = discounts.map(item => item.productId);
        const updatedProducts = await Product.find({
            productId: { $in: productIds }
        });

        results.successful = updatedProducts.map(product => product.toObject());

        res.status(200).json({
            message: `Successfully updated ${results.successful.length} discounts`,
            results
        });
    } catch (error) {
        console.error("Error bulk updating discounts:", error);
        res.status(500).json({
            message: "Failed to update discounts",
            error: error.message
        });
    }
});

module.exports = router;