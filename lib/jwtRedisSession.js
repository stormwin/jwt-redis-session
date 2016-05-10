'use strict';

const	jwt = require('jsonwebtoken'),
		JWTSession = require('./utils');

module.exports = function(options){

	if(!options.client || !options.secret)
		throw new Error('Redis client and secret required for jwtRedisSession!');

	options = {
		client: options.client,
		secret: options.secret,
		algorithm: options.algorithm || 'HS256',
		keyspace: options.keyspace || 'sess',
		maxAge: options.maxAge || 86400,
		requestKey: options.requestKey || 'session',
		requestArg: options.requestArg || 'accessToken'
	};

	let sessionMethods = new JWTSession(options);

	const requestHeader = options.requestArg.split('').reduce(function(memo, ch){
		return memo + (ch.toUpperCase() === ch ? '-' + ch.toLowerCase() : ch);
	}, 'x' + (options.requestArg.charAt(0) === options.requestArg.charAt(0).toUpperCase() ? '' : '-'));

	return function(req, res, next){

		req[options.requestKey] = sessionMethods;

		const token = (req.params ? req.params[options.requestArg] : false) ||
					(req.body ? req.body[options.requestArg] : false) ||
					(req.query ? req.query[options.requestArg] : false) ||
					req.headers[requestHeader] ||
					(req.cookies ? req.cookies[requestHeader] : false);


		if(!token) return next();

		jwt.verify(token, options.secret, function(error, decoded){
			
			if(error || !decoded.jti)

				return next(new Error(error || 'problem with token or decoding'));

			options.client.get([options.keyspace, decoded.user, decoded.jti].join(':'), function(err, session){
				

				if(err) return next(new Error(err));

				if(!session) {
					console.error('no session');
					return next();
				}

				try{
					session = JSON.parse(session);
				}catch(e){
					return next(new Error(e));
				}

				sessionMethods.id = decoded.jti;
				sessionMethods.data = Object.assign(req[options.requestKey].data, session);

				return next();
			});
		});
	};
};