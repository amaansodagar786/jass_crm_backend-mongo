const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Invoice = require("../models/invoiceModel");
const GlobalCounter = require("../models/globalCounter");
const Inventory = require("../models/inventory");

// Create new invoice
// Create new invoice - FIXED VERSION (No Transactions)
router.post("/create-invoice", async (req, res) => {
  try {
    // Generate Invoice number using atomic operation
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

    const newInvoiceNumber = `INV${new Date().getFullYear()}${String(counter.count).padStart(4, "0")}`;

    // Create invoice with generated number
    const invoiceData = {
      ...req.body,
      invoiceNumber: newInvoiceNumber
    };

    // Step 1: Create the invoice first
    const newInvoice = new Invoice(invoiceData);
    await newInvoice.save();

    // Step 2: Update inventory quantities for each item
    for (const item of req.body.items) {
      const inventoryItem = await Inventory.findOne({ productId: item.productId });

      // If product not found in inventory, delete the invoice and return error
      if (!inventoryItem) {
        await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });
        return res.status(404).json({
          success: false,
          message: `Product "${item.name}" not found in inventory`
        });
      }

      // Find the specific batch
      const batch = inventoryItem.batches.find(b => b.batchNumber === item.batchNumber);

      // If batch not found, delete the invoice and return error
      if (!batch) {
        await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });
        return res.status(404).json({
          success: false,
          message: `Batch "${item.batchNumber}" not found for product "${item.name}"`
        });
      }

      // Check if sufficient quantity available
      if (batch.quantity < item.quantity) {
        await Invoice.findOneAndDelete({ invoiceNumber: newInvoiceNumber });
        return res.status(400).json({
          success: false,
          message: `Insufficient quantity for "${item.name}" (Batch: ${item.batchNumber}). Available: ${batch.quantity}, Requested: ${item.quantity}`
        });
      }

      // Deduct the quantity from batch
      batch.quantity -= item.quantity;
      await inventoryItem.save();

      console.log(`Updated inventory: ${item.name} - Batch ${item.batchNumber} - Remaining: ${batch.quantity}`);
    }

    // Step 3: If everything successful, return the created invoice
    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: newInvoice.toObject()
    });

  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create invoice",
      error: error.message
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

// Delete invoice
router.delete("/delete-invoice/:invoiceNumber", async (req, res) => {
  try {
    const deletedInvoice = await Invoice.findOneAndDelete({
      invoiceNumber: req.params.invoiceNumber
    });

    if (!deletedInvoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Invoice deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete invoice",
      error: error.message
    });
  }
});

// Update invoice
router.put("/update-invoice/:invoiceNumber", async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { customer, paymentType, remarks } = req.body;

    console.log("Updating invoice:", invoiceNumber);
    console.log("Customer data:", customer);
    console.log("Payment type:", paymentType);
    console.log("Remarks:", remarks);

    // Check if the invoice exists
    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (!existingInvoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    // Build update payload
    const updatePayload = {};

    if (paymentType && ["cash", "card", "upi"].includes(paymentType)) {
      updatePayload.paymentType = paymentType;
    }

    if (customer) {
      updatePayload.customer = {
        customerId: customer.customerId || existingInvoice.customer.customerId,
        customerNumber: customer.customerNumber || existingInvoice.customer.customerNumber,
        name: customer.name || existingInvoice.customer.name,
        email: customer.email || existingInvoice.customer.email || "",
        mobile: customer.mobile || existingInvoice.customer.mobile,
      };
    }

    // Add remarks handling - allow empty string to clear remarks
    if (remarks !== undefined) {
      updatePayload.remarks = remarks;
    }

    // Perform update (Mongoose will auto-update `updatedAt`)
    const updatedInvoice = await Invoice.findOneAndUpdate(
      { invoiceNumber },
      updatePayload,
      {
        new: true, // Return updated document
        runValidators: true // Run schema validators
      }
    );

    console.log("Invoice updated successfully");

    res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      data: updatedInvoice.toObject()
    });

  } catch (error) {
    console.error("Error updating invoice:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update invoice",
      error: error.message
    });
  }
});

module.exports = router;