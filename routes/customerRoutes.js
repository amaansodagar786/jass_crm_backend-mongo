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


// POST bulk-create-customers - Create multiple customers from Excel
router.post("/bulk-create-customers", async (req, res) => {
  try {
    const { customers } = req.body;

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        message: "No customer data provided"
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    // Process each customer
    for (const customerData of customers) {
      try {
        const { email, contactNumber, customerName } = customerData;

        // Validate required fields
        if (!customerName || !contactNumber) {
          results.failed.push({
            customer: customerData,
            error: "Customer name and mobile number are required"
          });
          continue;
        }

        // Validate mobile number format
        if (!/^[0-9]{10}$/.test(contactNumber)) {
          results.failed.push({
            customer: customerData,
            error: "Mobile number must be exactly 10 digits"
          });
          continue;
        }

        // Validate email format if provided
        if (email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
          results.failed.push({
            customer: customerData,
            error: "Invalid email format"
          });
          continue;
        }

        // Check for existing customer by email (if email provided)
        if (email) {
          const existingCustomer = await Customer.findOne({ email });
          if (existingCustomer) {
            results.failed.push({
              customer: customerData,
              error: "Customer with this email already exists"
            });
            continue;
          }
        }

        // Check for existing customer by mobile number
        const existingByMobile = await Customer.findOne({ contactNumber });
        if (existingByMobile) {
          results.failed.push({
            customer: customerData,
            error: "Customer with this mobile number already exists"
          });
          continue;
        }

        // Create new customer
        const customer = new Customer(customerData);
        const savedCustomer = await customer.save();
        results.successful.push(savedCustomer.toObject());

      } catch (error) {
        results.failed.push({
          customer: customerData,
          error: error.message
        });
      }
    }

    res.status(200).json({
      message: `Bulk import completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      results
    });

  } catch (error) {
    console.error("Error in bulk customer creation:", error);
    res.status(500).json({
      message: "Failed to process bulk customer import",
      error: error.message
    });
  }
});


// Update customer loyalty coins - CORRECTED VERSION
router.put("/update-loyalty-coins/:customerId", async (req, res) => {
  try {
    const { customerId } = req.params;
    const { coinsEarned, coinsUsed } = req.body;

    const customer = await Customer.findOne({ customerId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    let currentCoins = customer.loyaltyCoins || 0;
    const previousBalance = currentCoins;

    // Step 1: First DEDUCT used coins (if any)
    if (coinsUsed && coinsUsed > 0) {
      currentCoins = Math.max(0, currentCoins - coinsUsed);
    }

    // Step 2: Then ADD earned coins (if any)
    if (coinsEarned && coinsEarned > 0) {
      currentCoins = currentCoins + coinsEarned;
    }

    customer.loyaltyCoins = currentCoins;
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Loyalty coins updated successfully",
      data: {
        customerId: customer.customerId,
        loyaltyCoins: customer.loyaltyCoins,
        coinsEarned: coinsEarned || 0,
        coinsUsed: coinsUsed || 0,
        previousBalance: previousBalance
      }
    });

  } catch (error) {
    console.error("Error updating loyalty coins:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update loyalty coins",
      error: error.message
    });
  }
});

module.exports = router;