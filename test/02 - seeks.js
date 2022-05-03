"use strict";
const http   = require('http');
const path   = require('path');
const sprintf = require('util').format;

const expect = require('expect.js');
const drain     = require('nyks/stream/drain');
const promisify = require('nyks/function/promisify');
const request   = require('nyks/http/request');
const md5       = require('nyks/crypto/md5');
const bl        = require('bl');

const FIXTURE_URL = "http://127.0.0.1:%d/water_drop.flv"
const FIXTURE_HASH = "f7170c15083261291c478ea61d4e99db";

const FIXTURE_EMPTY_URL = "http://127.0.0.1:%d/empty"
const FIXTURE_EMPTY_HASH = "d41d8cd98f00b204e9800998ecf8427e";

const express = require('express');

const RandomReadHTTP = require('../')

describe("Seeks test suite", function(){

  this.timeout(5 * 1000);
  let body;
  let tmp = Buffer.alloc(4096);
  let remote;

  let server, port;
  before("it should start local server", async () => {
    let app = express();
    app.use(express.static(path.resolve(__dirname, "fixtures")));

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
    console.log("Server running on port", port);
  });

  it("Should buffer fixture localy", async () => {
    body = new bl();
    body.append(await drain(request(sprintf(FIXTURE_URL, port))));
    expect(md5(body.slice())).to.eql(FIXTURE_HASH);
  });


  it("Should read the begining of the file", async () => {
    remote = new RandomReadHTTP(sprintf(FIXTURE_URL, port));
    await new Promise((resolve) => {
      remote.read(tmp, 10, 0, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(0, size)));
        expect(remote._seeks).to.eql(1);
        resolve();
      });
    });
  });

  it("Should read bytes flowing", async () => {
    await new Promise((resolve) => {
      remote.read(tmp, 10, 10, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(10, 10 + size)));
        expect(remote._seeks).to.eql(1); //no seeks
        resolve();
      });
    });
  });


  it("Should read bytes 30-40 flowing", async () => {
    await new Promise((resolve) => {
      remote.read(tmp, 10, 30, function(size) {

        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(30, 30 + size)));
        expect(remote._seeks).to.eql(1); //no seeks
        resolve();
      });
    });
  });


  it("Should read bytes 20-30 flowing", async () => {
    await new Promise((resolve) => {
      remote.read(tmp, 10, 20, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(20, 20 + size)));
        expect(remote._seeks).to.eql(2); //seeks back
        resolve();
      });
    });
  });

  it("Should read bytes 45-55 flowing", async () => {
    await new Promise((resolve) => {
      remote.read(tmp, 10, 45, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(45, 45 + size)));
        expect(remote._seeks).to.eql(2); //no seeks
        resolve();
      });
    });
  });



});