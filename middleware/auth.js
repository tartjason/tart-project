const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    // Get token from header
    const token = req.header('x-auth-token');

    // Check if not token
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Verify token
    try {
        // Use the same secret from your login route
        const decoded = jwt.verify(token, 'mysecrettoken');
        // Ensure payload is an object before accessing properties
        if (typeof decoded === 'object' && decoded.artist) {
            req.artist = decoded.artist;
            next();
        } else {
            throw new Error('Invalid token payload');
        }
    } catch (err) {
        console.error('Auth Middleware Error:', err.message); // DEBUG LOG
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
