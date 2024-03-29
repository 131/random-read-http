"use strict";

const expect = require('expect.js');
const drain     = require('nyks/stream/drain');
const request   = require('nyks/http/request');
const md5       = require('nyks/crypto/md5');
const bl        = require('bl');

const FIXTURE_URL = "https://raw.githubusercontent.com/wiki/131/random-read-http/fixtures/water_drop.flv"
const FIXTURE_HASH = "f7170c15083261291c478ea61d4e99db";

const FIXTURE_EMPTY_URL = "https://raw.githubusercontent.com/wiki/131/random-read-http/fixtures/empty"
const FIXTURE_EMPTY_HASH = "d41d8cd98f00b204e9800998ecf8427e";

const RandomReadHTTP = require('../')

describe("Main test suite", function(){

  this.timeout(5 * 1000);
  let body;
  let tmp = Buffer.alloc(4096);
  let remote;

  it("Should buffer fixture localy", async () => {
    body = new bl();
    body.append(await drain(request(FIXTURE_URL)));
    expect(md5(body.slice())).to.eql(FIXTURE_HASH);
  });


  it("Should read the begining of the file", async () => {
    remote = new RandomReadHTTP(FIXTURE_URL);
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

  it("Should seek without requesting remote seek when in buffer", async () => {
    await new Promise((resolve) => {
      remote.read(tmp, 10, 20 + 1, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(21, 21 + size)));
        expect(remote._seeks).to.eql(1); //no seeks
        resolve();
      });
    });
  });


  it("Should no crash on out of bound entries", async () => {
    await new Promise((resolve) => {
      remote.read(tmp, 10, body.length + 10, function(size) {
        expect(size).to.eql(0);
        expect(remote._seeks).to.eql(1); //no seeks
        resolve();
      });
    });
  });



  it("Should seek to read file end", async () => {
    await new Promise((resolve) => {
      remote.read(tmp, 10, body.length - 10, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(body.length - 10)));
        expect(remote._seeks).to.eql(2); //no seeks
        resolve();
      });
    });
  });


  it("Should re-open all when closing", async () => {
    remote.close();
    await new Promise((resolve) => {
      remote.read(tmp, 10, body.length - 10, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(body.slice(body.length - 10)));
        expect(remote._seeks).to.eql(3);
        resolve();
      });
    });
  });

  it("Should read an empty file", async () => {
    remote = new RandomReadHTTP(FIXTURE_EMPTY_URL);
    await new Promise((resolve) => {
      remote.read(tmp, 10, 0, function(size) {
        expect(md5(tmp.slice(0, size))).to.eql(md5(""));
        resolve();
      });
    });
  });



});