
const { rateLimit } = require("express-rate-limit");

const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    }
});

const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many login attempts. Please try again later."
    }
});

const forgetPasswordLimiter = rateLimit({
    windowMs:15*1000*60,
    limit:5,
    standardHeaders:true,
    legacyHeaders:true,
    message:{
        success:false,
        message:"Too many requests. Try after sometime."
    }
})



module.exports = {
    generalLimiter,
    loginLimiter,
    forgetPasswordLimiter
};