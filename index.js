const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const PORT = process.env.PORT || 3128;
const app = express();
const cache = require("memory-cache"); // In-memory cache
const flatCache = require("flat-cache"); // Using flat file for caching
const path = require("path");
const MemCached = require("memcached"); // distributed memory object caching system
const redis = require("redis");
const client = redis.createClient();

// In-memory cache
// Cons: once the server goes down, all cached content is lost.
let memCache = new cache.Cache();
let cacheMiddleware = duration => {
  return (req, res, next) => {
    let key = "__express__" + req.originalUrl || req.url;
    let cachedContent = memCache.get(key);

    console.log("In-memory cachedContent: ", cachedContent);

    if (cachedContent) {
      res.send(cachedContent);
      return;
    }

    res.sendResponse = res.send;
    res.send = body => {
      memCache.put(key, body, duration * 1000);
      res.sendResponse(body);
    };

    next();
  };
};

// Flat cache
let productsFlatCache = flatCache.load("productsCache", path.resolve("./"));
let flatCacheMiddleware = (req, res, next) => {
  let key = "__express__" + req.originalUrl || req.url;
  let cachedContent = productsFlatCache.getKey(key);

  console.log("Flat cache cachedContent: ", cachedContent);

  if (cachedContent) {
    res.send(cachedContent);
    return;
  }

  res.sendResponse = res.send;
  res.send = body => {
    productsFlatCache.setKey(key, body);
    productsFlatCache.save();
    res.sendResponse(body);
  };

  next();
};

// memcached
let memcached = new MemCached("127.0.0.1:11211");
let memcachedMiddleware = duration => {
  return (req, res, next) => {
    let key = "__express__" + req.originalUrl || req.url;
    memcached.get(key, function(err, data) {
      console.log("memcached data: ", data);

      if (data) {
        res.send(data);
        return;
      }

      res.sendResponse = res.send;
      res.send = body => {
        memcached.set(key, body, duration * 60, function(err) {
          if (err) {
            console.log("memcached err: ", JSON.stringify(err));
          }
        });
        res.sendResponse(body);
      };

      next();
    });
  };
};

let redisMiddleware = (req, res, next) => {
  let key = "__express__" + req.originalUrl || req.url;
  client.get(key, function(err, reply) {
    console.log("Redis replies with: ", reply);

    if (reply) {
      res.send(reply);
      return;
    }

    res.sendResponse = res.send;
    res.send = body => {
      client.set(key, JSON.stringify(body));
      res.sendResponse(body);
    };

    next();
  });
};

// "/products" route with in-memory cache middleware
// app.get("/products", cacheMiddleware(30), function(req, res) {
// "/products" route with flat-cache middleware
// app.get("/products", flatCacheMiddleware, function(req, res) {
// "/products" route with memcached middleware
// app.get("/products", memcachedMiddleware(20), function(req, res) {
// "/products" route with redis middleware
app.get("/products", redisMiddleware, function(req, res) {
  setTimeout(() => {
    let db = new sqlite3.Database("./NodeInventory.db");
    let sql = `SELECT * from products`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        throw err;
      }

      db.close();
      res.send(rows);
    });
  }, 3000);
});

app.listen(PORT, function() {
  console.log(`App running on PORT ${PORT}`);
});
