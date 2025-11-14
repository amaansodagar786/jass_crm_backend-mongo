const mongoose = require('mongoose');

const invoiceUpdateHistorySchema = new mongoose.Schema({
    updateId: {
        type: String,
        unique: true,
        required: true
    },
    originalInvoiceNumber: {
        type: String,
        required: true
    },
    updatedBy: {
        userId: String,
        name: String,
        email: String
    },
    changes: {
        itemsAdded: [{
            productId: String,
            productName: String,
            batchNumber: String,
            quantity: Number,
            price: Number
        }],
        itemsRemoved: [{
            productId: String,
            productName: String,
            batchNumber: String,
            quantity: Number,
            price: Number
        }],
        itemsUpdated: [{
            productId: String,
            productName: String,
            batchNumber: String,
            oldQuantity: Number,
            newQuantity: Number,
            quantityDifference: Number
        }],
        productsChanged: [{
            oldProductId: String,
            oldProductName: String,
            oldBatchNumber: String,
            oldQuantity: Number,
            newProductId: String,
            newProductName: String,
            newBatchNumber: String,
            newQuantity: Number
        }]
    },
    inventoryUpdates: [{
        productId: String,
        productName: String,
        batchNumber: String,
        quantityChange: Number,
        operation: String, // 'ADD' or 'DEDUCT'
        beforeQuantity: Number,
        afterQuantity: Number
    }],
    calculationChanges: {
        oldTotal: Number,
        newTotal: Number,
        difference: Number
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
        default: 'SUCCESS'
    },
    errorDetails: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('InvoiceUpdateHistory', invoiceUpdateHistorySchema);