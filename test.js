"use strict";


const drain     = require('nyks/stream/drain');
const sleep = require('nyks/async/sleep');
const promisify = require('nyks/function/promisify');
const request   = require('nyks/http/request');

const RandomReadHTTP = require('.')




//  const FIXTURE_URL = "https://raw.githubusercontent.com/wiki/131/random-read-http/fixtures/water_drop.flv"
const FIXTURE_URL = "https://storage.gra5.cloud.ovh.net/v1/AUTH_8e33dd68177c49a48660fd7616474d22/cloudfs/58/1/581af06b5951523b55661dbd538d135e?temp_url_sig=e108f9263e8b86c8dc2c7e0c2453e813e81afc1b&temp_url_expires=1567374261"
const FIXTURE_HASH = "f7170c15083261291c478ea61d4e99db";

class test {
  constructor() {
    this.offset = 0;
    this.buf = Buffer.alloc(4096);
    this.remote = new RandomReadHTTP(FIXTURE_URL, {
      MIN_BL_SIZE : 1024 * 1024, //1Mo
      MAX_BL_SIZE : 0,
    });
  }

  async test() {
    for(var i = 5; i<= 10; i++) {
      console.log("Loop", i);
        
      console.log("Read", await this.read());
      console.log("Waiting a bit", i, i * 60);
      await sleep(1000 * 60 * i);
      console.log("Now reading");
      console.log("Read", await this.read());
    }
  }

  
  async read() {
    return await new Promise((resolve) => {
      console.log("READING %d at %d", 68 * 1024, this.offset);
      this.remote.read(this.tmp, 68 * 1024, this.offset, (size) => {
        this.offset += size;
        resolve(size);
      });
    });
  }

}

module.exports = test;
