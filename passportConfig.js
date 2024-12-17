const User = require("./models/user");
const bcrypt = require("bcryptjs");
const localStrategy = require("passport-local").Strategy;
const LocalStrategy = require('passport-local').Strategy;


module.exports = function (passport) {
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Find user by username
        const user = await User.findOne({ username });

        // If no user is found, return false
        if (!user) return done(null, false, { message: 'Username or password is incorrect' });

        // Compare the password with the hashed password stored in the database
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
          return done(null, user);  // User authenticated successfully
        } else {
          return done(null, false, { message: 'Username or password is incorrect' });
        }
      } catch (err) {
        return done(err);  // Handle any errors that occur during the process
      }
    })
  );

  // Serialize user information (store the user ID in the session)
  passport.serializeUser((user, cb) => {
    cb(null, user.id);
  });

  // Deserialize user from session (retrieve the full user object using the stored ID)
  passport.deserializeUser(async (id, cb) => {
    try {
      const user = await User.findById(id);  // Use `findById` instead of `findOne`
      cb(null, user);
    } catch (err) {
      cb(err);  // Handle errors
    }
  });
};
