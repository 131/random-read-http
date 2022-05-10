"use strict";

const https = require('https');
const http  = require('http');

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


// when resuming after (more than ?) 140s
// node behave weirdly, and output few MBs before ending the remote stream
// the few MBs contains then contains DUPLICATED DATA and breaks everything

const MAX_SLEEP_TIME = 60 * 1000;


class RandomReadHTTP {
  constructor(remote_url, options) {
    this.remote_size = null;
    this.remote_url = remote_url;
    this._seeks = 0; //keep seeks count
    this.agent  = new https.Agent({keepAlive : true});
    this.hagent = new http.Agent({keepAlive : true});

    options = {MAX_BL_SIZE : MAX_BL, MIN_BL_SIZE : MIN_BL, ...options};
    this.MAX_BL = options.MAX_BL_SIZE;
    this.MIN_BL = options.MIN_BL_SIZE;
  }

  close() {
    this.closing = true;
    if(this.agent) {
      this.agent.destroy();
      this.agent = null;
    }

    if(this.hagent) {
      this.hagent.destroy();
      this.hagent = null;
    }

    if(this.res) {
      logger.info("Closing", this.remote_url);
      this.res.destroy();
      this.res = null;
    }

    if(this.bl) {
      this.bl.consume(this.bl.length);
      this.bl = null;
    }

  }

  async _open() {
    logger.info("Opening", this.remote_url);
    //request head & store headers
    let head = await request({
      ...url.parse(this.remote_url),
      'method' : 'HEAD',
    }, this.agent, this.hagent);
    if(head.statusCode != 200)
      throw `Invalid statusCode ${head.statusCode}`;
    if((head.headers['accept-ranges'] || '').indexOf('bytes') == -1)
      throw `Remote does not accept ranges`;
    this.remote_size = Number(head.headers['content-length']);
    this.remote_pos  = -1;
  }

  async read(buf, len, offset, cb) {

    if(this.remote_size == null) {
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

    if(seeking && this.res) {
      //first, check if we can cancel seek using current buffer
      let shift = offset - this.remote_pos;
      if(shift > 0 && this.bl.length >= shift) {
        this.bl.consume(shift);
        this.remote_pos += shift;
        seeking = false;
      }
    }

    if(seeking) {
      if(this.res) {
        logger.info("Should kill current seek (remote_pos %d, offset %d)", this.remote_pos, offset);
        this.res.pause();
        this.bl.consume(this.bl.length); //drain all
        this.bl = null;
      }

      this.bl  = bl();
      this.res = await this._readSeek(offset, this.bl);
    }

    let atEnd = this.remote_size == offset + this.bl.length;
    if((this.res.readableEnded || this.res._readableEnded) && !this.closing && !atEnd) {
      logger.info("Re-open at %d (bl %d/%s)", offset, this.bl.length, prettyFileSize(this.bl.length));
      this.res = await this._readSeek(offset + this.bl.length, this.bl);
    }

    logger.debug("Reading %d bytes at %d (bl %s, %s)", len, offset, prettyFileSize(this.bl.length), this.res.isPaused() ? 'paused' : 'flowing');

    if(this.bl.length <= this.MIN_BL && this.res.isPaused()) {
      logger.info("RESTART BUFFERING at %d (bl %d/%s)", offset, this.bl.length, prettyFileSize(this.bl.length));

      if(Date.now() - this.res.paused > MAX_SLEEP_TIME)
        this.res.destroy(), this.res._readableEnded = true;
      else
        this.res.resume();
    }

    while(this.bl.length < len) {
      if(this.res.isPaused())
        this.res.resume();
      await new Promise(resolve => this.res.once('data', resolve)); //?
    }

    this.bl.copy(buf, 0, 0, len);
    this.bl.consume(len);
    this.remote_pos = offset + len;
    cb(len);
  }

  async _readSeek(offset, bli) {
    this._seeks++;
    logger.info("Reading (seeking) at %d ", offset);
    let range = `${offset}-${this.remote_size - 1}`;
    let res = await request({
      ...url.parse(this.remote_url),
      headers : {range : `bytes=${range}`},
    }, this.agent, this.hagent);

    if(res.statusCode != 206)
      throw `Invalid partial request response ${res.statusCode}`;

    res.on('end', () => {
      logger.info("Reaching end", this.remote_url);
      res._readableEnded = true;
    });

    res.on('data', (buf) => {
      bli.append(buf);
      if(bli.length >= this.MAX_BL) {
        res.paused = Date.now();
        logger.info("SLOWING RES ABIT", prettyFileSize(bli.length));
        res.pause();
      }
    });

    return res;
  }
}


//helpers
const prettyFileSize  = function(bytes) {
  var size = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  var factor = Math.floor((bytes.toString().length - 1) / 3);
  return sprintf("%s%s", Math.floor(100 * bytes / Math.pow(1024, factor)) / 100, size[factor]);
};

const request = function({protocol, ...query}, agent, hagent) {
  return new Promise((resolve, reject) => {
    let req = protocol ==  "https:"  ? https.request({agent, ...query}, resolve) : http.request({agent : hagent, ...query}, resolve);
    req.on('error', reject);
    req.end();
  });
};


module.exports = RandomReadHTTP;

