"use strict";

const https = require('https');
const url   = require('url');
const bl    = require('bl');
const debug = require('debug');

const logger = {
  info  : debug('random-read-http:info'),
  debug : debug('random-read-http:debug'),
};

const sprintf = require('util').format;

const MAX_BL = 20 * 1024 * 1024; // 20 MB
const MIN_BL = 5 * 1024 * 1024;  // 5 MB

class RandomReadHTTP {
  constructor(remote_url, options) {
    this.fd = null;
    this.remote_url = remote_url;
    this._seeks = 0; //keep seeks count
    this.agent = new https.Agent({keepAlive : true});

    options = {MAX_BL_SIZE : MAX_BL, MIN_BL_SIZE : MIN_BL, ...options};
    this.MAX_BL = options.MAX_BL_SIZE;
    this.MIN_BL = options.MIN_BL_SIZE;
  }

  close() {
    if(this.fd) {
      this.fd.close();
      this.fd = null;
    }
    if(this.agent) {
      this.agent.destroy();
      this.agent = null;
    }
    if(this.res) {
      this.res.destroy();
      this.res.bl.consume(this.res.bl.length);
      this.res.bl = null;
      this.res = null;
    }
  }

  async _open() {
    logger.info("Opening", this.remote_url);
    //request head & store headers
    let head = await request({
      agent : this.agent,
      ...url.parse(this.remote_url),
      'method' : 'HEAD',
    });
    if(head.statusCode != 200)
      throw `Invalid statusCode ${head.statusCode}`;
    if((head.headers['accept-ranges'] || '').indexOf('bytes') == -1)
      throw `Remote does not accept ranges`;
    this.remote_size = Number(head.headers['content-length']);
    this.remote_pos  = -1;
  }

  async read(buf, len, offset, cb) {

    if(!this.remote_size) {
      this._open().then(() => {
        this.read(buf, len, offset, cb);
      });
      return;
    }

    if(offset >= this.remote_size || len <= 0)
      return cb(0);

    if(offset + len >= this.remote_size)
      len = this.remote_size - offset;

    //check last offset and detect if we seek
    let seeking = this.remote_pos != offset;

    if(seeking) {
      //first, check if we can cancel seek using current buffer
      let shift = offset - this.remote_pos;
      if(shift > 0  && this.res && this.res.bl.length >= shift) {
        this.res.bl.consume(shift);
        this.remote_pos += shift;
        seeking = false;
      }
    }

    if(seeking) {
      if(this.res) {
        logger.info("Should kill current seek (remote_pos %d, offset %d)", this.remote_pos, offset);
        this.res.pause();
        this.res.bl.consume(this.res.bl.length);
        this.res.bl = null;
      }

      this.res = await this._readSeek(offset);

    }

    logger.debug("Reading %d bytes at %d (bl %s, %s)", len, offset, prettyFileSize(this.res.bl.length), this.res.isPaused() ? 'paused' : 'flowing');

    if(this.res.bl.length <= this.MIN_BL && this.res.isPaused()) {
      logger.info("RESTART BUFFERING", prettyFileSize(this.res.bl.length));
      this.res.resume();
    }

    while(this.res.bl.length < len) {
      if(this.res.isPaused())
        this.res.resume();
      await new Promise(resolve => this.res.once('data', resolve));
    }

    this.res.bl.copy(buf, 0, 0, len);
    this.res.bl.consume(len);
    this.remote_pos = offset + len;
    cb(len);
  }

  async _readSeek(offset) {
    this._seeks++;
    logger.info("Reading (seeking) at %d ", offset, this.remote_pos);
    let range = `${offset}-${this.remote_size - 1}`;
    let res = await request({
      agent : this.agent,
      ...url.parse(this.remote_url),
      headers : {range : `bytes=${range}`},
    });
    if(res.statusCode != 206)
      throw `Invalid partial request response ${res.statusCode}`;

    let bli = bl();
    res.on('data', (buf) => {
      bli.append(buf);
      if(bli.length >= this.MAX_BL) {
        logger.info("SLOWING RES ABIT", prettyFileSize(bli.length));
        res.pause();
      }
    });

    res.bl = bli;
    return res;
  }
}


//helpers
const prettyFileSize  = function(bytes) {
  var size = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  var factor = Math.floor((bytes.toString().length - 1) / 3);
  return sprintf("%s%s", Math.floor(100 * bytes / Math.pow(1024, factor)) / 100, size[factor]);
};

const request = function(query) {
  return new Promise((resolve, reject) => {
    let req = https.request(query, resolve);
    req.on('error', reject);
    req.end();
  });
};


module.exports = RandomReadHTTP;

