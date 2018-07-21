'use strict';

const jwt = require('jsonwebtoken'),
	{ promisify } = require('util'),
	utils = require('./utils'),
	JWTVerify = promisify(jwt.verify).bind(jwt);

module.exports = (options) => {
	if (!options.client || !options.secret) {
		throw new Error('Redis client and secret required for jwtRedisSession!');
	}

	options = {
		client: options.client,
		secret: options.secret,
		algorithm: options.algorithm || 'HS256',
		keyspace: options.keyspace || 'sess:',
		maxAge: options.maxAge || 86400,
		requestKey: options.requestKey || 'session',
		requestArg: options.requestArg || 'accessToken'
	};

	const sessionMethods = utils(options);
	const RedisGet = promisify(options.client.get).bind(options.client);

	const requestHeader = options.requestArg.split('').reduce((memo, ch) => {
		return memo + (ch.toUpperCase() === ch ? '-' + ch.toLowerCase() : ch);
	}, 'x' + (options.requestArg.charAt(0) === options.requestArg.charAt(0).toUpperCase() ? '' : '-'));

	return async (req, res, next) => {

		req[options.requestKey] = {};

		req[options.requestKey] = Object.assign(sessionMethods);

		let token = req.params ? req.params[options.requestArg] : false;
		token = token || (req.body ? req.body[options.requestArg] : false);
		token = token || (req.query ? req.query[options.requestArg] : false);
		token = token || req.headers[requestHeader];
		token = token || (req.cookies ? req.cookies[requestHeader] : false);

		if (token) {
			try {
				const decoded = await JWTVerify(token, options.secret);
				if (!(decoded && decoded.jti)) {
					throw '';
				}

				let session = await RedisGet(options.keyspace + decoded.jti);
				if (!session) {
					throw '';
				}
				session = JSON.parse(session);

				req[options.requestKey] = Object.assign(req[options.requestKey], session);
				req[options.requestKey].claims = decoded;
				req[options.requestKey].id = decoded.jti;
				req[options.requestKey].jwt = token;
				req[options.requestKey].touch(); // update the TTL
				return next();
			} catch (error) {
				return next();
			}
		} else {
			return next();
		}
	};
};
