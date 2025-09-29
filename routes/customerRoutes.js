const express = require("express");
const router = express.Router();
const Customer = require("../models/customer"); // Updated path

// POST create-customer - Create new customer
router.post("/create-customer", async (req, res) => {
  try {
    const { email } = req.body;

    // Only check for existing customer if email is provided
    if (email) {
      const existingCustomer = await Customer.findOne({ email });
      
      if (existingCustomer) {
        return res.status(400).json({
          message: "Customer with this email already exists",
          field: "email"
        });
      }
    }

    const customer = new Customer(req.body);
    const savedCustomer = await customer.save();
    
    // Convert to plain object to match DynamoDB structure
    const response = savedCustomer.toObject();
    res.status(201).json(response);
    
  } catch (error) {
    console.error("Error creating customer:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }
    
    res.status(500).json({
      message: "Failed to create customer",
      error: error.message
    });
  }
});

// GET get-customers - Get all customers
router.get("/get-customers", async (req, res) => {
  try {
    const customers = await Customer.find({}).sort({ createdAt: -1 });
    
    // Convert to plain objects to match previous structure
    const plainCustomers = customers.map(customer => customer.toObject());
    
    res.status(200).json(plainCustomers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ 
      message: "Failed to fetch customers", 
      error: error.message 
    });
  }
});

// PUT update-customer/:id - Update customer
router.put("/update-customer/:id", async (req, res) => {
  try {
    const { customerId, _id, createdAt, updatedAt, ...updateData } = req.body;

    const updatedCustomer = await Customer.findOneAndUpdate(
      { customerId: req.params.id },
      updateData,
      { 
        new: true, // Return updated document
        runValidators: true // Run schema validators
      }
    );

    if (!updatedCustomer) {
      return res.status(404).json({
        message: "Customer not found"
      });
    }

    res.status(200).json(updatedCustomer.toObject());
  } catch (error) {
    console.error("Error updating customer:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }
    
    res.status(500).json({
      message: "Failed to update customer",
      error: error.message
    });
  }
});

// DELETE delete-customer/:id - Delete customer
router.delete("/delete-customer/:id", async (req, res) => {
  try {
    const deletedCustomer = await Customer.findOneAndDelete({ 
      customerId: req.params.id 
    });

    if (!deletedCustomer) {
      return res.status(404).json({
        message: "Customer not found"
      });
    }

    res.status(200).json({ 
      message: "Customer deleted successfully" 
    });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ 
      message: "Failed to delete customer", 
      error: error.message 
    });
  }
});

// Additional route to get customer by ID if needed
router.get("/get-customer/:id", async (req, res) => {
  try {
    const customer = await Customer.findOne({ customerId: req.params.id });
    
    if (!customer) {
      return res.status(404).json({
        message: "Customer not found"
      });
    }

    res.status(200).json(customer.toObject());
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ 
      message: "Failed to fetch customer", 
      error: error.message 
    });
  }
});

module.exports = router;