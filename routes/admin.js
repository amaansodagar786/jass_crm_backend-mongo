const express = require('express');
const router = express.Router();
const User = require("../models/user");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../routes/auth');

// Get all users (admin only)
router.get('/users', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const users = await User.find({}).sort({ createdAt: -1 });
    
    // Convert to plain objects and remove passwords
    const usersWithoutPasswords = users.map(user => {
      const userObj = user.toObject();
      delete userObj.password;
      return userObj;
    });
    
    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Register new user (admin only)
router.post('/register', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const { name, email, phone, password, permissions } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: "Email already registered",
        field: "email"
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      permissions: permissions || []
    });

    const savedUser = await user.save();
    
    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      message: "User registered successfully",
      user: {
        userId: userResponse.userId,
        name: userResponse.name,
        email: userResponse.email,
        phone: userResponse.phone,
        permissions: userResponse.permissions,
        createdAt: userResponse.createdAt
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }
    
    res.status(500).json({ 
      message: "Registration failed", 
      error: error.message 
    });
  }
});

// Update user (admin only)
router.put('/users/:userId', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const { userId } = req.params;
    const { name, email, phone, permissions } = req.body;

    // Find user
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.userId !== userId) {
        return res.status(400).json({ 
          message: "Email already taken by another user",
          field: "email"
        });
      }
    }

    // Update user
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.permissions = permissions || user.permissions;

    const updatedUser = await user.save();
    
    // Remove password from response
    const userResponse = updatedUser.toObject();
    delete userResponse.password;
    
    res.json({
      message: "User updated successfully",
      user: {
        userId: userResponse.userId,
        name: userResponse.name,
        email: userResponse.email,
        phone: userResponse.phone,
        permissions: userResponse.permissions,
        createdAt: userResponse.createdAt,
        updatedAt: userResponse.updatedAt
      }
    });
  } catch (error) {
    console.error("Update error:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }
    
    res.status(500).json({ 
      message: "Update failed", 
      error: error.message 
    });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.permissions || !req.user.permissions.includes('admin')) {
      return res.status(403).json({ message: 'Access denied. Admin required.' });
    }

    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user.userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Delete user
    const deletedUser = await User.findOneAndDelete({ userId });
    
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ 
      message: "Delete failed", 
      error: error.message 
    });
  }
});

module.exports = router;