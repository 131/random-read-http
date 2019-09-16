[![Build Status](https://travis-ci.org/131/random-read-http.svg?branch=master)](https://travis-ci.org/131/random-read-http)
[![Coverage Status](https://coveralls.io/repos/github/131/random-read-http/badge.svg?branch=master)](https://coveralls.io/github/131/random-read-http?branch=master)
[![Version](https://img.shields.io/npm/v/random-read-http.svg)](https://www.npmjs.com/package/random-read-http)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)
[![Code style](https://img.shields.io/badge/code%2fstyle-ivs-green.svg)](https://www.npmjs.com/package/eslint-plugin-ivs)



# Motivation

This module allows you to open an http(s) url and read through it at random offsets (seeking). This is usefull when working with pseudo-fs like [cloudfs](../cloudfs).

It's optimized for speed and efficiency, using http(s) agent & http 1.1 polling & a buffer list to control the flow and minimized round-trips.


# API / usage

```
const RandomReadHTTP = require('random-read-http');

let remote = new RandomReadHTTP("https://someurl/somefile.mkv");

remote.read(buf, 0, 10, function(len) {
  console.log("Got 10 first bytes into", buf);
  remote.close(); //free up http agent
});

```

## constructor(remote_url [, options]) 
Options are :
* **MAX_BL_SIZE** (default to 20MB). flow will be paused when internal buffer reach **MAX_BL_SIZE** limit.
* **MIN_BL_SIZE** (default to 2.5MB). flow will be resumed if internal buffer is lower than **MIN_BL_SIZE**.



# Credits / inspiration
* [131](https://github.com/131)
* [Nick Craig-Wood' rclone/vfs/read/doSeek](https://github.com/ncw/rclone/blob/master/vfs/read.go#L217)
* [mafintosh' random-access-stuffs](https://github.com/random-access-storage)

