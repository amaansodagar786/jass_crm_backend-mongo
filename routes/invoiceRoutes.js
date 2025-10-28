const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Invoice = require("../models/invoiceModel");
const GlobalCounter = require("../models/globalCounter");
const Inventory = require("../models/inventory");
const DeletedInvoice = require("../models/deletedInvoiceModel");


// In your create-invoice route
// router.post("/create-invoice", async (req, res) => {
//   const startTime = Date.now();
//   const requestId = `INV_REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

//   try {
//     console.log(`🔄 [${requestId}] Starting invoice creation process`);
//     console.log(`📥 [${requestId}] Request body summary:`, {
//       customer: req.body.customer?.name || 'Unknown',
//       itemsCount: req.body.items?.length || 0,
//       totalAmount: req.body.total,
//       paymentType: req.body.paymentType,
//       hasPromo: !!req.body.appliedPromoCode
//     });

//     // Generate Invoice number using atomic operation
//     console.log(`🔢 [${requestId}] Generating invoice number...`);
//     const counterId = "invoices";
//     let counter = await GlobalCounter.findOneAndUpdate(
//       { id: counterId },
//       { $inc: { count: 1 } },
//       {
//         new: true,
//         upsert: true,
//         setDefaultsOnInsert: true
//       }
//     );

//     const newInvoiceNumber = `INV${new Date().getFullYear()}${String(counter.count).padStart(4, "0")}`;
//     console.log(`✅ [${requestId}] Invoice number generated: ${newInvoiceNumber}`);
//     console.log(`📊 [${requestId}] Counter updated - next count: ${counter.count + 1}`);

//     // Create invoice with generated number including promo details
//     const invoiceData = {
//       ...req.body,
//       invoiceNumber: newInvoiceNumber,
//       // Ensure promo details are properly saved
//       appliedPromoCode: req.body.appliedPromoCode ? {
//         ...req.body.appliedPromoCode,
//         appliedAt: new Date()
//       } : null,
//       promoDiscount: req.body.promoDiscount || 0
//     };

//     console.log(`📄 [${requestId}] Invoice data prepared:`, {
//       invoiceNumber: newInvoiceNumber,
//       customer: invoiceData.customer?.name,
//       itemsCount: invoiceData.items?.length,
//       subtotal: invoiceData.subtotal,
//       discount: invoiceData.discount,
//       promoDiscount: invoiceData.promoDiscount,
//       total: invoiceData.total,
//       paymentType: invoiceData.paymentType
//     });

//     // Step 1: Create the invoice first
//     console.log(`💾 [${requestId}] Saving invoice to database...`);
//     const newInvoice = new Invoice(invoiceData);
//     await newInvoice.save();
//     console.log(`✅ [${requestId}] Invoice saved successfully to database`);

//     // Step 2: Update inventory quantities for each item
//     console.log(`📦 [${requestId}] Starting inventory update for ${invoiceData.items?.length} items`);

//     for (const [index, item] of req.body.items.entries()) {
//       console.log(`🔍 [${requestId}] Processing item ${index + 1}/${req.body.items.length}:`, {
//         productId: item.productId,
//         name: item.name,
//         batchNumber: item.batchNumber,
//         quantity: item.quantity,
//         price: item.price
//       });

//       const inventoryItem = await Inventory.findOne({ productId: item.productId });

//       if (!inventoryItem) {
//         console.log(`❌ [${requestId}] Product not found in inventory:`, {
//           productId: item.productId,
//           productName: item.name,
//           batchNumber: item.batchNumber
//         });

//         // Rollback: Delete the created invoice
//         console.log(`🔄 [${requestId}] Rolling back - deleting invoice ${newInvoiceNumber}`);
//         await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });

//         console.log(`❌ [${requestId}] Invoice creation failed - Product not found`);
//         return res.status(404).json({
//           success: false,
//           message: `Product "${item.name}" not found in inventory`,
//           requestId: requestId
//         });
//       }

//       console.log(`📋 [${requestId}] Inventory item found:`, {
//         productName: inventoryItem.productName,
//         totalQuantity: inventoryItem.totalQuantity,
//         batchesCount: inventoryItem.batches.length
//       });

//       const batch = inventoryItem.batches.find(b => b.batchNumber === item.batchNumber);

//       if (!batch) {
//         console.log(`❌ [${requestId}] Batch not found:`, {
//           productId: item.productId,
//           productName: item.name,
//           requestedBatch: item.batchNumber,
//           availableBatches: inventoryItem.batches.map(b => b.batchNumber)
//         });

//         // Rollback: Delete the created invoice
//         console.log(`🔄 [${requestId}] Rolling back - deleting invoice ${newInvoiceNumber}`);
//         await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });

//         console.log(`❌ [${requestId}] Invoice creation failed - Batch not found`);
//         return res.status(404).json({
//           success: false,
//           message: `Batch "${item.batchNumber}" not found for product "${item.name}"`,
//           requestId: requestId,
//           availableBatches: inventoryItem.batches.map(b => b.batchNumber)
//         });
//       }

//       console.log(`📊 [${requestId}] Batch details:`, {
//         batchNumber: batch.batchNumber,
//         currentQuantity: batch.quantity,
//         requestedQuantity: item.quantity,
//         expiryDate: batch.expiryDate
//       });

//       if (batch.quantity < item.quantity) {
//         console.log(`❌ [${requestId}] Insufficient quantity:`, {
//           productName: item.name,
//           batchNumber: item.batchNumber,
//           available: batch.quantity,
//           requested: item.quantity,
//           shortage: item.quantity - batch.quantity
//         });

//         // Rollback: Delete the created invoice
//         console.log(`🔄 [${requestId}] Rolling back - deleting invoice ${newInvoiceNumber}`);
//         await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });

//         console.log(`❌ [${requestId}] Invoice creation failed - Insufficient quantity`);
//         return res.status(400).json({
//           success: false,
//           message: `Insufficient quantity for "${item.name}" (Batch: ${item.batchNumber}). Available: ${batch.quantity}, Requested: ${item.quantity}`,
//           requestId: requestId,
//           available: batch.quantity,
//           requested: item.quantity
//         });
//       }

//       // Update inventory quantity
//       const oldQuantity = batch.quantity;
//       batch.quantity -= item.quantity;
//       const newQuantity = batch.quantity;

//       console.log(`🔄 [${requestId}] Updating inventory:`, {
//         productName: item.name,
//         batchNumber: item.batchNumber,
//         quantityChange: -item.quantity,
//         oldQuantity: oldQuantity,
//         newQuantity: newQuantity
//       });

//       await inventoryItem.save();
//       console.log(`✅ [${requestId}] Inventory updated successfully for ${item.name}`);
//     }

//     // Calculate processing time
//     const processingTime = Date.now() - startTime;

//     console.log(`🎉 [${requestId}] Invoice creation completed successfully!`, {
//       invoiceNumber: newInvoiceNumber,
//       totalItems: newInvoice.items.length,
//       customer: newInvoice.customer?.name,
//       totalAmount: newInvoice.total,
//       processingTime: `${processingTime}ms`,
//       timestamp: new Date().toISOString()
//     });

//     console.log(`📦 [${requestId}] Inventory updates summary:`, {
//       itemsProcessed: newInvoice.items.length,
//       totalQuantityReduced: newInvoice.items.reduce((sum, item) => sum + item.quantity, 0),
//       customer: newInvoice.customer?.name
//     });

//     // Step 3: Return success response
//     res.status(201).json({
//       success: true,
//       message: "Invoice created successfully",
//       data: newInvoice.toObject(),
//       requestId: requestId,
//       processingTime: `${processingTime}ms`
//     });

//   } catch (error) {
//     const processingTime = Date.now() - startTime;

//     console.error(`💥 [${requestId}] Error creating invoice:`, {
//       error: error.message,
//       stack: error.stack,
//       processingTime: `${processingTime}ms`,
//       timestamp: new Date().toISOString()
//     });

//     console.error(`📋 [${requestId}] Error context:`, {
//       invoiceNumber: newInvoiceNumber || 'NOT_GENERATED',
//       itemsCount: req.body.items?.length,
//       customer: req.body.customer?.name
//     });

//     // If invoice was created but something else failed, attempt rollback
//     if (newInvoiceNumber) {
//       try {
//         console.log(`🔄 [${requestId}] Attempting to rollback - deleting invoice ${newInvoiceNumber}`);
//         await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });
//         console.log(`✅ [${requestId}] Rollback completed`);
//       } catch (rollbackError) {
//         console.error(`❌ [${requestId}] Rollback failed:`, rollbackError.message);
//       }
//     }

//     res.status(500).json({
//       success: false,
//       message: "Failed to create invoice",
//       error: error.message,
//       requestId: requestId,
//       processingTime: `${processingTime}ms`
//     });
//   }
// });


// In your create-invoice route - FIXED VERSION
router.post("/create-invoice", async (req, res) => {
  const startTime = Date.now();
  const requestId = `INV_REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let newInvoiceNumber = null;

  try {
    console.log(`🔄 [${requestId}] Starting invoice creation process`);
    console.log(`📥 [${requestId}] Request body summary:`, {
      customer: req.body.customer?.name || 'Unknown',
      itemsCount: req.body.items?.length || 0,
      totalAmount: req.body.total,
      paymentType: req.body.paymentType,
      hasPromo: !!req.body.appliedPromoCode
    });

    // 🛡️ STEP 1: Validate request data FIRST
    if (!req.body.items || req.body.items.length === 0) {
      console.log(`❌ [${requestId}] No items in request`);
      return res.status(400).json({
        success: false,
        message: "Invoice must contain at least one item",
        requestId: requestId
      });
    }

    if (!req.body.customer || !req.body.customer.mobile || !req.body.customer.name) {
      console.log(`❌ [${requestId}] Invalid customer data`);
      return res.status(400).json({
        success: false,
        message: "Customer name and mobile are required",
        requestId: requestId
      });
    }

    // 🛡️ STEP 2: Validate ALL inventory items BEFORE any creation
    console.log(`🔍 [${requestId}] Validating inventory for ${req.body.items.length} items...`);
    
    const inventoryValidation = [];
    
    for (const [index, item] of req.body.items.entries()) {
      console.log(`🔍 [${requestId}] Validating item ${index + 1}/${req.body.items.length}:`, {
        productId: item.productId,
        name: item.name,
        batchNumber: item.batchNumber,
        quantity: item.quantity
      });

      // Validate item data
      if (!item.productId || !item.batchNumber || !item.quantity || item.quantity < 1) {
        inventoryValidation.push({
          productId: item.productId,
          productName: item.name,
          error: "Invalid item data - productId, batchNumber and quantity (min 1) are required"
        });
        continue;
      }

      const inventoryItem = await Inventory.findOne({ productId: item.productId });

      if (!inventoryItem) {
        inventoryValidation.push({
          productId: item.productId,
          productName: item.name,
          batchNumber: item.batchNumber,
          error: "Product not found in inventory"
        });
        continue;
      }

      const batch = inventoryItem.batches.find(b => b.batchNumber === item.batchNumber);

      if (!batch) {
        inventoryValidation.push({
          productId: item.productId,
          productName: item.name,
          batchNumber: item.batchNumber,
          error: "Batch not found for this product",
          availableBatches: inventoryItem.batches.map(b => b.batchNumber)
        });
        continue;
      }

      // Check expiry
      const isExpired = new Date(batch.expiryDate) < new Date();
      if (isExpired) {
        inventoryValidation.push({
          productId: item.productId,
          productName: item.name,
          batchNumber: item.batchNumber,
          error: "Batch has expired",
          expiryDate: batch.expiryDate
        });
        continue;
      }

      // Check quantity
      if (batch.quantity < item.quantity) {
        inventoryValidation.push({
          productId: item.productId,
          productName: item.name,
          batchNumber: item.batchNumber,
          error: "Insufficient quantity",
          available: batch.quantity,
          requested: item.quantity,
          shortage: item.quantity - batch.quantity
        });
        continue;
      }

      // Store valid batch for later update
      inventoryValidation.push({
        productId: item.productId,
        productName: item.name,
        batchNumber: item.batchNumber,
        inventoryItem: inventoryItem,
        batch: batch,
        quantity: item.quantity,
        valid: true
      });
    }

    // 🛡️ STEP 3: Check if any validation failed
    const failedValidations = inventoryValidation.filter(item => !item.valid);
    if (failedValidations.length > 0) {
      console.log(`❌ [${requestId}] Inventory validation failed:`, failedValidations);
      return res.status(400).json({
        success: false,
        message: "Inventory validation failed",
        requestId: requestId,
        validationErrors: failedValidations,
        details: {
          totalErrors: failedValidations.length,
          firstError: failedValidations[0]?.error,
          exampleItem: failedValidations[0]?.productName
        }
      });
    }

    console.log(`✅ [${requestId}] All inventory validation passed for ${inventoryValidation.length} items`);

    // 🛡️ STEP 4: Generate invoice number ONLY after validation
    console.log(`🔢 [${requestId}] Generating invoice number...`);
    const counterId = "invoices";
    let counter = await GlobalCounter.findOneAndUpdate(
      { id: counterId },
      { $inc: { count: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    newInvoiceNumber = `INV${new Date().getFullYear()}${String(counter.count).padStart(4, "0")}`;
    console.log(`✅ [${requestId}] Invoice number generated: ${newInvoiceNumber}`);

    // 🛡️ STEP 5: Prepare invoice data
    const invoiceData = {
      ...req.body,
      invoiceNumber: newInvoiceNumber,
      appliedPromoCode: req.body.appliedPromoCode ? {
        ...req.body.appliedPromoCode,
        appliedAt: new Date()
      } : null,
      promoDiscount: req.body.promoDiscount || 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log(`📄 [${requestId}] Invoice data prepared:`, {
      invoiceNumber: newInvoiceNumber,
      customer: invoiceData.customer?.name,
      itemsCount: invoiceData.items?.length,
      subtotal: invoiceData.subtotal,
      discount: invoiceData.discount,
      promoDiscount: invoiceData.promoDiscount,
      total: invoiceData.total,
      paymentType: invoiceData.paymentType
    });

    // 🛡️ STEP 6: Start database transaction (if using MongoDB transactions)
    // For simplicity, we'll handle rollback manually
    
    let invoiceCreated = false;
    let inventoryUpdated = false;

    try {
      // 🛡️ STEP 7: Create the invoice
      console.log(`💾 [${requestId}] Saving invoice to database...`);
      const newInvoice = new Invoice(invoiceData);
      await newInvoice.save();
      invoiceCreated = true;
      console.log(`✅ [${requestId}] Invoice saved successfully to database`);

      // 🛡️ STEP 8: Update inventory quantities
      console.log(`📦 [${requestId}] Updating inventory for ${inventoryValidation.length} items...`);
      
      const inventoryUpdates = [];
      
      for (const validation of inventoryValidation) {
        if (validation.valid) {
          const oldQuantity = validation.batch.quantity;
          validation.batch.quantity -= validation.quantity;
          const newQuantity = validation.batch.quantity;

          console.log(`🔄 [${requestId}] Updating inventory:`, {
            productName: validation.productName,
            batchNumber: validation.batchNumber,
            quantityChange: -validation.quantity,
            oldQuantity: oldQuantity,
            newQuantity: newQuantity
          });

          inventoryUpdates.push(validation.inventoryItem.save());
        }
      }

      // Wait for all inventory updates to complete
      await Promise.all(inventoryUpdates);
      inventoryUpdated = true;
      console.log(`✅ [${requestId}] All inventory updates completed successfully`);

      // 🛡️ STEP 9: Calculate processing time and return success
      const processingTime = Date.now() - startTime;

      console.log(`🎉 [${requestId}] Invoice creation completed successfully!`, {
        invoiceNumber: newInvoiceNumber,
        totalItems: newInvoice.items.length,
        customer: newInvoice.customer?.name,
        totalAmount: newInvoice.total,
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString()
      });

      console.log(`📦 [${requestId}] Inventory updates summary:`, {
        itemsProcessed: newInvoice.items.length,
        totalQuantityReduced: newInvoice.items.reduce((sum, item) => sum + item.quantity, 0),
        customer: newInvoice.customer?.name
      });

      res.status(201).json({
        success: true,
        message: "Invoice created successfully",
        data: newInvoice.toObject(),
        requestId: requestId,
        processingTime: `${processingTime}ms`
      });

    } catch (dbError) {
      // 🛡️ STEP 10: Handle database errors with proper rollback
      console.error(`💥 [${requestId}] Database error during invoice creation:`, dbError.message);
      
      // Rollback logic
      if (invoiceCreated && !inventoryUpdated) {
        console.log(`🔄 [${requestId}] Rolling back - deleting invoice ${newInvoiceNumber}`);
        try {
          await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });
          console.log(`✅ [${requestId}] Invoice rollback completed`);
        } catch (rollbackError) {
          console.error(`❌ [${requestId}] Invoice rollback failed:`, rollbackError.message);
        }
      }
      
      // Re-throw to be caught by outer catch block
      throw dbError;
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error(`💥 [${requestId}] Error creating invoice:`, {
      error: error.message,
      stack: error.stack,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });

    console.error(`📋 [${requestId}] Error context:`, {
      invoiceNumber: newInvoiceNumber || 'NOT_GENERATED',
      itemsCount: req.body.items?.length,
      customer: req.body.customer?.name
    });

    res.status(500).json({
      success: false,
      message: "Failed to create invoice",
      error: error.message,
      requestId: requestId,
      processingTime: `${processingTime}ms`
    });
  }
});

// Get all invoices
router.get("/get-invoices", async (req, res) => {
  try {
    const invoices = await Invoice.find({}).sort({ createdAt: -1 });

    // Convert to plain objects to match previous structure
    const plainInvoices = invoices.map(invoice => invoice.toObject());

    res.status(200).json({
      success: true,
      data: plainInvoices
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch invoices",
      error: error.message
    });
  }
});

// Get invoice by invoiceNumber
router.get("/get-invoice/:invoiceNumber", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      invoiceNumber: req.params.invoiceNumber
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    res.status(200).json({
      success: true,
      data: invoice.toObject()
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch invoice",
      error: error.message
    });
  }
});


router.delete("/delete-invoice/:invoiceNumber", async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    console.log(`🔄 Attempting to delete invoice: ${invoiceNumber}`);
    console.log('📋 Request details:', {
      invoiceNumber,
      timestamp: new Date().toISOString()
    });

    // Step 1: Find the invoice to be deleted
    const invoiceToDelete = await Invoice.findOne({
      invoiceNumber: invoiceNumber
    });

    if (!invoiceToDelete) {
      console.log('❌ Invoice not found:', invoiceNumber);
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    console.log('📄 Invoice found for deletion:', {
      invoiceNumber: invoiceToDelete.invoiceNumber,
      customer: invoiceToDelete.customer?.name,
      itemsCount: invoiceToDelete.items.length,
      totalAmount: invoiceToDelete.total
    });

    // Step 2: Validate all batches exist before proceeding
    const batchValidationErrors = [];

    for (const item of invoiceToDelete.items) {
      const inventoryItem = await Inventory.findOne({
        productId: item.productId
      });

      if (!inventoryItem) {
        batchValidationErrors.push({
          productId: item.productId,
          productName: item.name,
          batchNumber: item.batchNumber,
          error: "Product not found in inventory"
        });
        continue;
      }

      const batch = inventoryItem.batches.find(
        b => b.batchNumber === item.batchNumber
      );

      if (!batch) {
        batchValidationErrors.push({
          productId: item.productId,
          productName: item.name,
          batchNumber: item.batchNumber,
          error: "Batch not found for this product"
        });
      }
    }

    // Step 3: If any batch errors, STOP and return error
    if (batchValidationErrors.length > 0) {
      console.log('❌ Batch validation failed - Invoice deletion cancelled:', {
        invoiceNumber,
        errors: batchValidationErrors
      });

      return res.status(400).json({
        success: false,
        message: "Cannot delete invoice - inventory batches not found",
        errors: batchValidationErrors,
        details: {
          invoiceNumber: invoiceToDelete.invoiceNumber,
          totalErrors: batchValidationErrors.length,
          failedItems: batchValidationErrors
        }
      });
    }

    console.log('✅ All batches validated successfully - proceeding with deletion');

    // Step 4: Archive the invoice before deletion
    const deletedInvoice = new DeletedInvoice({
      originalInvoiceNumber: invoiceNumber,
      invoiceData: invoiceToDelete.toObject(),
      deletedBy: req.user?.username || "system"
    });

    await deletedInvoice.save();
    console.log('📁 Invoice archived to deleted invoices collection');

    // Step 5: Restore inventory quantities
    const stockRestorationDetails = [];
    const inventoryUpdates = [];

    for (const item of invoiceToDelete.items) {
      const inventoryItem = await Inventory.findOne({
        productId: item.productId
      });

      if (inventoryItem) {
        const batch = inventoryItem.batches.find(
          b => b.batchNumber === item.batchNumber
        );

        if (batch) {
          // Record stock before restoration
          const beforeStock = batch.quantity;

          // Restore the quantity
          batch.quantity += item.quantity;
          const afterStock = batch.quantity;

          // Save stock restoration details
          stockRestorationDetails.push({
            productId: item.productId,
            productName: item.name,
            batchNumber: item.batchNumber,
            quantityRestored: item.quantity,
            beforeDeletionStock: beforeStock,
            afterRestorationStock: afterStock
          });

          console.log(`📦 Inventory restored: ${item.name} (Batch: ${item.batchNumber})`, {
            restoredQuantity: item.quantity,
            before: beforeStock,
            after: afterStock
          });

          // Store inventory update promise
          inventoryUpdates.push(inventoryItem.save());
        }
      }
    }

    // Step 6: Wait for all inventory updates to complete
    await Promise.all(inventoryUpdates);
    console.log('✅ All inventory updates completed');

    // Step 7: Update deleted invoice with stock restoration details
    deletedInvoice.stockRestoration = {
      restored: true,
      restoredAt: new Date(),
      itemsStockDetails: stockRestorationDetails
    };
    await deletedInvoice.save();

    // Step 8: Delete the original invoice
    await Invoice.findOneAndDelete({
      invoiceNumber: invoiceNumber
    });

    console.log('✅ Invoice successfully deleted:', {
      invoiceNumber,
      itemsRestored: stockRestorationDetails.length,
      customer: invoiceToDelete.customer?.name,
      totalAmount: invoiceToDelete.total,
      deletionTime: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: "Invoice deleted successfully and inventory restored",
      restorationDetails: {
        itemsRestored: stockRestorationDetails.length,
        details: stockRestorationDetails
      }
    });

  } catch (error) {
    console.error('💥 Error deleting invoice:', {
      invoiceNumber: req.params.invoiceNumber,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      message: "Failed to delete invoice",
      error: error.message
    });
  }
});

// Get all deleted invoices
router.get("/get-deleted-invoices", async (req, res) => {
  try {
    const deletedInvoices = await DeletedInvoice.find({})
      .sort({ deletedAt: -1 });

    res.status(200).json({
      success: true,
      data: deletedInvoices
    });
  } catch (error) {
    console.error("Error fetching deleted invoices:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch deleted invoices",
      error: error.message
    });
  }
});

// Get specific deleted invoice
router.get("/get-deleted-invoice/:originalInvoiceNumber", async (req, res) => {
  try {
    const deletedInvoice = await DeletedInvoice.findOne({
      originalInvoiceNumber: req.params.originalInvoiceNumber
    });

    if (!deletedInvoice) {
      return res.status(404).json({
        success: false,
        message: "Deleted invoice not found"
      });
    }

    res.status(200).json({
      success: true,
      data: deletedInvoice
    });
  } catch (error) {
    console.error("Error fetching deleted invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch deleted invoice",
      error: error.message
    });
  }
});

// Update invoice
router.put("/update-invoice/:invoiceNumber", async (req, res) => {
  const startTime = Date.now();
  const requestId = `UPDATE_INV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const { invoiceNumber } = req.params;
    const { customer, paymentType, remarks } = req.body;

    console.log(`🔄 [${requestId}] Starting invoice update process`);
    console.log(`📥 [${requestId}] Update request details:`, {
      invoiceNumber: invoiceNumber,
      hasCustomerData: !!customer,
      paymentType: paymentType,
      hasRemarks: remarks !== undefined,
      timestamp: new Date().toISOString()
    });

    console.log(`🔍 [${requestId}] Request payload details:`, {
      customer: customer ? {
        name: customer.name,
        mobile: customer.mobile,
        email: customer.email
      } : 'No customer update',
      paymentType: paymentType || 'No payment type update',
      remarks: remarks !== undefined ? (remarks ? `"${remarks}"` : 'Clearing remarks') : 'No remarks update'
    });

    // Check if the invoice exists
    console.log(`🔎 [${requestId}] Checking if invoice exists: ${invoiceNumber}`);
    const existingInvoice = await Invoice.findOne({ invoiceNumber });

    if (!existingInvoice) {
      console.log(`❌ [${requestId}] Invoice not found: ${invoiceNumber}`);
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
        requestId: requestId
      });
    }

    console.log(`✅ [${requestId}] Invoice found:`, {
      invoiceNumber: existingInvoice.invoiceNumber,
      currentCustomer: existingInvoice.customer?.name,
      currentPaymentType: existingInvoice.paymentType,
      currentRemarks: existingInvoice.remarks || 'No remarks',
      totalAmount: existingInvoice.total
    });

    // Build update payload
    const updatePayload = {};
    const changes = [];

    if (paymentType && ["cash", "card", "upi"].includes(paymentType)) {
      if (paymentType !== existingInvoice.paymentType) {
        updatePayload.paymentType = paymentType;
        changes.push(`Payment type: ${existingInvoice.paymentType} → ${paymentType}`);
        console.log(`💰 [${requestId}] Payment type change: ${existingInvoice.paymentType} → ${paymentType}`);
      } else {
        console.log(`ℹ️  [${requestId}] Payment type unchanged: ${paymentType}`);
      }
    }

    if (customer) {
      const customerChanges = [];
      const updatedCustomer = {
        customerId: customer.customerId || existingInvoice.customer.customerId,
        customerNumber: customer.customerNumber || existingInvoice.customer.customerNumber,
        name: customer.name || existingInvoice.customer.name,
        email: customer.email || existingInvoice.customer.email || "",
        mobile: customer.mobile || existingInvoice.customer.mobile,
      };

      // Check for actual changes in customer data
      if (customer.name && customer.name !== existingInvoice.customer.name) {
        customerChanges.push(`Name: ${existingInvoice.customer.name} → ${customer.name}`);
      }
      if (customer.email && customer.email !== existingInvoice.customer.email) {
        customerChanges.push(`Email: ${existingInvoice.customer.email} → ${customer.email}`);
      }
      if (customer.mobile && customer.mobile !== existingInvoice.customer.mobile) {
        customerChanges.push(`Mobile: ${existingInvoice.customer.mobile} → ${customer.mobile}`);
      }

      if (customerChanges.length > 0) {
        updatePayload.customer = updatedCustomer;
        changes.push(...customerChanges);
        console.log(`👤 [${requestId}] Customer updates:`, customerChanges);
      } else {
        console.log(`ℹ️  [${requestId}] No customer data changes detected`);
      }
    }

    // Add remarks handling - allow empty string to clear remarks
    if (remarks !== undefined) {
      const currentRemarks = existingInvoice.remarks || '';
      if (remarks !== currentRemarks) {
        updatePayload.remarks = remarks;
        changes.push(`Remarks: "${currentRemarks}" → "${remarks}"`);
        console.log(`📝 [${requestId}] Remarks change: "${currentRemarks}" → "${remarks}"`);
      } else {
        console.log(`ℹ️  [${requestId}] Remarks unchanged: "${remarks}"`);
      }
    }

    // Check if there are any actual changes
    if (Object.keys(updatePayload).length === 0) {
      console.log(`ℹ️  [${requestId}] No changes detected - update payload empty`);
      return res.status(200).json({
        success: true,
        message: "No changes detected - invoice remains unchanged",
        data: existingInvoice.toObject(),
        requestId: requestId,
        changes: []
      });
    }

    console.log(`📤 [${requestId}] Update payload to be applied:`, updatePayload);
    console.log(`📋 [${requestId}] Total changes: ${changes.length}`, changes);

    // Perform update (Mongoose will auto-update `updatedAt`)
    console.log(`💾 [${requestId}] Saving updates to database...`);
    const updatedInvoice = await Invoice.findOneAndUpdate(
      { invoiceNumber },
      updatePayload,
      {
        new: true, // Return updated document
        runValidators: true // Run schema validators
      }
    );

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    console.log(`✅ [${requestId}] Invoice updated successfully!`, {
      invoiceNumber: updatedInvoice.invoiceNumber,
      changesApplied: changes.length,
      processingTime: `${processingTime}ms`,
      updatedAt: updatedInvoice.updatedAt,
      customer: updatedInvoice.customer?.name,
      paymentType: updatedInvoice.paymentType
    });

    console.log(`📊 [${requestId}] Final invoice state:`, {
      customer: updatedInvoice.customer?.name,
      mobile: updatedInvoice.customer?.mobile,
      paymentType: updatedInvoice.paymentType,
      remarks: updatedInvoice.remarks || 'No remarks',
      totalAmount: updatedInvoice.total
    });

    res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      data: updatedInvoice.toObject(),
      requestId: requestId,
      changes: changes,
      processingTime: `${processingTime}ms`
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error(`💥 [${requestId}] Error updating invoice:`, {
      invoiceNumber: req.params.invoiceNumber,
      error: error.message,
      stack: error.stack,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });

    console.error(`📋 [${requestId}] Error context:`, {
      customerData: req.body.customer ? 'Present' : 'Absent',
      paymentType: req.body.paymentType,
      remarks: req.body.remarks !== undefined ? 'Present' : 'Absent'
    });

    res.status(500).json({
      success: false,
      message: "Failed to update invoice",
      error: error.message,
      requestId: requestId,
      processingTime: `${processingTime}ms`
    });
  }
});


// POST bulk-import-invoices - FIXED VERSION (Groups items by invoice)
router.post("/bulk-import-invoices", async (req, res) => {
  try {
    const { invoices } = req.body;

    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No invoice data provided"
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    // Group invoices by invoiceNumber to handle multiple items
    const invoiceMap = new Map();

    invoices.forEach(invoiceData => {
      const invoiceNumber = invoiceData.invoiceNumber;

      if (!invoiceMap.has(invoiceNumber)) {
        // Create new invoice entry
        invoiceMap.set(invoiceNumber, {
          ...invoiceData,
          items: [] // Initialize empty items array
        });
      }

      // Add all items to the same invoice
      if (invoiceData.items && invoiceData.items.length > 0) {
        invoiceMap.get(invoiceNumber).items.push(...invoiceData.items);
      }
    });

    const groupedInvoices = Array.from(invoiceMap.values());

    // Process each grouped invoice
    for (const invoiceData of groupedInvoices) {
      try {
        const originalInvoiceNumber = invoiceData.invoiceNumber;

        // Check if invoice already exists
        const existingInvoice = await Invoice.findOne({
          invoiceNumber: originalInvoiceNumber
        });

        if (existingInvoice) {
          results.failed.push({
            invoiceNumber: originalInvoiceNumber,
            error: "Invoice already exists"
          });
          continue;
        }

        // Create invoice with all items
        const invoice = new Invoice({
          ...invoiceData,
          invoiceNumber: originalInvoiceNumber,
          createdAt: invoiceData.createdAt || new Date(),
          updatedAt: invoiceData.updatedAt || new Date()
        });

        const savedInvoice = await invoice.save();
        results.successful.push(savedInvoice.toObject());

      } catch (error) {
        results.failed.push({
          invoiceNumber: invoiceData.invoiceNumber || 'Unknown',
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk import completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      results
    });

  } catch (error) {
    console.error("Error in bulk invoice import:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process bulk invoice import",
      error: error.message
    });
  }
});


module.exports = router;