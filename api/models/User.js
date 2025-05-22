const mongoose = require('mongoose');
const { userSchema: baseUserSchema } = require('@librechat/data-schemas');

// Extend the schema
const userSchema = baseUserSchema.clone();
userSchema.add({
  wecomUserId: {
    type: String,
    unique: true,
    sparse: true, // Recommended for unique fields that are not always present
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
