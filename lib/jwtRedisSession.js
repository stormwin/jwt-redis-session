
var	jwt = require("jsonwebtoken"),
	utils = require("./utils");

module.exports = function(options){

	if(!options.client || !options.secret)
		throw new Error("Redis client and secret required for jwtRedisSession!");

	options = {
		client: options.client,
		secret: options.secret,
		algorithm: options.algorithm || "HS256",
		keyspace: options.keyspace || "sess:",
		maxAge: options.maxAge || 86400,
		requestKey: options.requestKey || "session",
		requestArg: options.requestArg || "accessToken"
	};

	var sessionMethods = utils(options);

	var requestHeader = options.requestArg.split("").reduce(function(memo, ch){
		return memo + (ch.toUpperCase() === ch ? "-" + ch.toLowerCase() : ch);
	}, "x" + (options.requestArg.charAt(0) === options.requestArg.charAt(0).toUpperCase() ? "" : "-"));

	return function(req, res, next){

		req[options.requestKey] = {};

		req[options.requestKey] = Object.assign(sessionMethods);

		var token = req.params ? req.params[options.requestArg] : false;
		token = token || (req.body ? req.body[options.requestArg] : false);
		token = token || (req.query ? req.query[options.requestArg] : false);
		token = token || req.headers[requestHeader];
		token = token || (req.cookies ? req.cookies[requestHeader] : false);

		if(token){
			jwt.verify(token, options.secret, function(error, decoded){
				if(error || !decoded.jti)
					return next();

				options.client.get(options.keyspace + decoded.jti, function(err, session){
					if(err || !session)
						return next();

					try{
						session = JSON.parse(session);
					}catch(e){
						return next();
					}

					req[options.requestKey] = Object.assign(req[options.requestKey], session);
					req[options.requestKey].claims = decoded;
					req[options.requestKey].id = decoded.jti;
					req[options.requestKey].jwt = token;
					req[options.requestKey].touch(); // update the TTL
					next();
				});
			});
		}else{
			next();
		}
	};
};
