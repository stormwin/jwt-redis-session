'use strict';

const	reduce = require('lodash.reduce'),
		jwt = require('jsonwebtoken'),
		async = require('async'),
		uuid = require('node-uuid');


function extendSession(session, data){
	return reduce(data, function(memo, val, key){
		if(typeof val !== 'function' && ['uuid', 'id', 'user', 'options'].indexOf(key) === -1)
			memo[key] = val;
		return memo;
	}, session);
}

function serializeSession(session){
	return reduce(session, function(memo, val, key){
		if(typeof val !== 'function' && ['uuid', 'id', 'user', 'options'].indexOf(key) === -1)
			memo[key] = val;
		return memo;
	}, {});
}

module.exports = class JWTSession{

	constructor(options) {
		this.options = options;
		this.id = undefined;
		this.user = undefined;
		this.data = {};
	}

	create(claims, callback){
		if(typeof claims === 'function' && !callback){
			callback = claims;
			claims = {};
		}

		this.user = claims.user;
		this.id  = uuid.v4();
		const token = jwt.sign(Object.assign({ jti: this.id }, claims || {}), this.options.secret, { algorithm: this.options.algorithm });
		this.options.client.setex(this._getSessionHash(), this.options.maxAge, this.toJSON(), function(error){
			return callback(error, token);
		});
	}

	touch(callback){
		if(this.uuid === undefined || this.user === undefined){
			return process.nextTick(function(){
				callback(new Error('Invalid session ID'));
			});
		}
		this.options.client.expire(this._getSessionHash(), this.options.maxAge, callback);
	}

	update(callback){
		if(this.id === undefined || this.user === undefined){
			return process.nextTick(function(){
				callback(new Error('Invalid session ID'));
			});
		}
		this.options.client.setex(this._getSessionHash(), this.options.maxAge, this.toJSON(), callback);
	}

	updateAll(callback){
		if(this.user === undefined){
			return process.nextTick(function(){
				callback(new Error('Invalid session ID'));
			});
		}
		let self = this;
		this._getAllSessionsKeys(function(err, rows){
			async.each(rows, function(row, callbackUpdate) {
				self.options.client.set(row, self.toJSON(), callbackUpdate);
			}, callback);
		});
	}

	reload(callback){
		var self = this;
		if(this.id === undefined || this.user === undefined){
			return process.nextTick(function(){
				callback(new Error('Invalid session ID'));
			});
		}

		this.options.client.get(this._getSessionHash(), function(error, resp){
			if(error)
				return callback(error);
			try{
				resp = JSON.parse(resp);
			}catch(e){
				return callback(e);
			}
			extendSession(self, resp);
			return callback();
		});
	}

	// destroy a session
	destroy(callback){
		if(this.id === undefined || this.user === undefined){
			return process.nextTick(function(){
				callback(new Error('Invalid session ID'));
			});
		}
		this.options.client.del(this._getSessionHash(), callback);
	}

	destroyAll(callback){
		if(this.user === undefined){
			return process.nextTick(function(){
				callback(new Error('Invalid session ID'));
			});
		}
		let self = this;
		this._getAllSessionsKeys(function(err, rows){
			async.each(rows, function(row, callbackDelete) {
				self.options.client.del(rows, callbackDelete);
			}, callback);
		});
	}

	countAllSessions(callback){
		this._getAllSessionsKeys(function(err, rows){
			return callback(err, rows.length);
		});
	}

	_getSessionHash(){
		return [this.options.keyspace, this.user, this.id].join(':');
	}

	_getWildcardHash(){
		return [this.options.keyspace, this.user, '*'].join(':');
	}

	_getAllSessionsKeys(callback) {
		this.options.client.keys(this._getWildcardHash(), function(err, rows) {
			return callback(err, rows);
		});
	}

	toJSON(){
		return JSON.stringify(this.data);
	}
};
