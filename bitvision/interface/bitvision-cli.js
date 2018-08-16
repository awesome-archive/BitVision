// GLOBALS
"use strict";
let fs = require("fs");
let blessed = require("blessed");
let contrib = require("blessed-contrib");
let childProcess = require("child_process");
let Gdax = require("gdax");
let writeJsonFile = require("write-json-file");

// ----------
// MODULES
// ----------

let login = require("./login");
let help = require("./help");
let transaction = require("./transaction");
let tradingToggle = require("./autotrading-toggle");

// ----------
// CONSTANTS
// ----------

const paths = {
  // TODO: Figure out how to write to home directory.
  // "configPath": "~/.bitvision",
  "configPath": ".bitvision.json",
  "blockchainDataPath": "../cache/data/blockchain.json",
  "headlineDataPath": "../cache/data/headlines.json",
  "technicalDataPath": "../cache/data/indicators.json",
  "priceDataPath": "../cache/data/price_data.json"
}

// TODO: Sync up with Jon about these commands.
const commands = {
  "login": "",
  "buy": "python3 ../services/trader.py -b ",
  "sell": "python3 ../services/trader.py -s ",
  "refresh": "python3 ../services/controller.py REFRESH",
  "retrain_model": "python3 ../services/controller.py RETRAIN"
}

const VERSION = "v0.1a";
const MAX_HEADLINE_LENTH = 35;

// ------------------
// UTILITY FUNCTIONS
// ------------------

/**
 * Truncates text if longer than len, otherwise does nothing.
 * @param  {String} text Text to be length checked and modified.
 * @param  {Number} len  Integer for longest allowable length.
 * @return {String}      Modified or unmodified input string.
 */
function trimIfLongerThan(text, len) {
  if (text.length > len) {
    return text.slice(0, len);
  } else {
    return text;
  }
}

/**
 * Read JSON file and do something with the data
 */
function readJsonFile(path, callback) {
  fs.readFile(path, "utf8", function(err, data) {
    if (err) {
      console.log(err);
    }
    callback(data);
  });
}

// -----------------------
// PYTHON CONTROL METHODS
// -----------------------

/**
 * Execute shell command.
 **/
function executeShellCommand(command) {
  log(command);
  let args = command.split(" ");
  // Remove first element
  let program = args.splice(0, 1)[0];
  log(args);
  log(program);
  let cmd = childProcess.spawn(program, args);

  cmd.stdout.on("data", function(data) {
    log("OUTPUT: " + data);
  });

  cmd.on("close", function(code, signal) {
    log("command finished...");
  });
}

function loginCommand() {
  executeShellCommand(commands.login)
}

function buyBTCCommand(amount) {
  executeShellCommand(commands.buyBTC + amount)
}

function sellBTCCommand(amount) {
  executeShellCommand(commands.sellBTC + amount)
}

function refreshDataCommand() {
  executeShellCommand(commands.refresh);
}

function retrainModelCommand() {
  executeShellCommand(commands.retrain_model);
}

// -------------------------
// CONFIG/CREDENTIALS FUNCTIONS
// -------------------------

function writeConfig(config) {
  log("WRITING DOTFILE");
  writeJsonFile(paths.configPath, config).then(() => {
    // log("File Saved");
  });
}

/**
 * Gets config file in dictionary form.
 */
function getConfig(callback) {
  // log("GETTING CONFIG");
  readJsonFile(paths.configPath, (data) => {
    let cfg = JSON.parse(data);
    callback(cfg);
  });
}

/**
 * Checks for credentials in the config file.
 *
 * @return {Bool} Returns true if all creds exist, false otherwise.
 */
function checkForCredentials() {
  getConfig((cfg) => {
    let creds = cfg.credentials;
    if (creds.key === "" || creds.secret !== "" || creds.passphrase !== "") {
      return false;
    } else {
      return true;
    }
  });
}

/**
 * Creates dotfile with default values if it doesn't exist.
 */
function createConfigIfNeeded() {
  log("CHECKING FOR DOTFILE");
  fs.stat(paths.configPath, function(err, stat) {
    if (err == null) {
      log("Exists");
      return;
    } else if (err.code === "ENOENT") {
      log("No dotfile found. Creating DEFAULT.");
      // Create file
      let emptyConfig = {
        "credentials": {
          "key": "",
          "secret": "",
          "passphrase": ""
        },
        "autotrade": {
          "enabled": false,
          "next-trade-timestamp-UTC": 0,
          "next-trade-amount": 0,
          "next-trade-side": "",
        },
      }
      writeConfig(emptyConfig);
    }
  });
}

function saveCredentials(newCreds) {
  log("SAVING CREDENTIALS");
  getConfig((cfg) => {
    cfg.credentials = newCreds;
    writeConfig(cfg);
  })
}

/**
 * Clear credentials by removing the dotfile.
 */
function clearCredentials() {
  fs.unlink(paths.configPath, (err) => {
    if (err) {
      throw err;
    }
    log(`${configPath} successfully deleted.`);
  });
}

// ---------------------------------
// BUILDING INTERFACE
// ** Bless up -> 3x preach emoji **
// ---------------------------------

var screen = blessed.screen({
  smartCSR: true,
  title: "Bitvision",
  cursor: {
    artificial: true,
    shape: "line",
    blink: true,
    color: "red"
  }
});

const log = (text) => {
  logs.pushLine(text);
  screen.render();
};

// -------------
// LOGIN SCREEN
// -------------

/**
 * Display login screen, allowing user to replace credentials.
 */
function displayLoginScreen() {
  log("DISPLAY LOGIN SCREEN");
  login.createLoginScreen(screen, (creds) => {
    if (creds != null) {
      log("New creds, saving.");
      saveCredentials(creds);
      log("Login success.");
    } else {
      log("No creds, abort.");
    }
  });
}

// ------------------
// COINBASE FUNCTIONS
// ------------------

function showAutotradingToggle() {
  log("Autotrading Toggle");
  tradingToggle.createToggleScreen(screen, function(isEnabling) {
    // log(`Enabling: ${isEnabling}`)
    getConfig((cfg) => {
      let isCurrentlyEnabled = cfg.autotrade.enabled;

      // Setting autotrading to the same state should do nothing.
      if ((isEnabling && isCurrentlyEnabled) || (!isEnabling && !isCurrentlyEnabled)) {
        log("Redundant autotrading change.");
        return;
      }

      // Autotrading disabled, so reset all properties to default
      if (!isEnabling) {
        log("Disabling autotrading.");
        cfg.autotrade.enabled = false;
        cfg.autotrade["next-trade-timestamp-UTC"] = 0;
        cfg.autotrade["next-trade-amount"] = 0;
        cfg.autotrade["next-trade-side"] = "";
      } else {
        // Autotrading enabled, so set next trade timestamp for +24 hr from now.
        log("Enabling autotrading.");
        cfg.autotrade.enabled = true;
        cfg.autotrade["next-trade-timestamp-UTC"] = 0; // TODO:
        cfg.autotrade["next-trade-amount"] = 0;
        cfg.autotrade["next-trade-side"] = "";
      }

      // Store updated configuration
      writeConfig(cfg);
    })
  });
}

function showTransactionAmountPopup() {
  transaction.createTransactionAmountPopup(screen, function(amount) {
    log(`Max transaction: ${amount} BTC`);
  });
}

// Placing widgets

var grid = new contrib.grid({
  rows: 12,
  cols: 12,
  screen: screen
})

// Place 3 tables on the left side of the screen, stacked vertically.

var headlinesTable = grid.set(0, 0, 3.5, 4, contrib.table, {
  keys: true,
  fg: "green",
  style: {
    border: {
      fg: "light-red"
    }
  },
  label: "Headlines",
  interactive: true,
  columnSpacing: 1,
  columnWidth: [7, 38, 10]
})

var technicalIndicatorsTable = grid.set(3.5, 0, 3.5, 4, contrib.table, {
  keys: true,
  fg: "green",
  style: {
    border: {
      fg: "light-red"
    }
  },
  label: "Technical Indicators",
  interactive: false,
  columnSpacing: 1,
  columnWidth: [35, 10, 10]
});

var blockchainIndicatorsTable = grid.set(6.8, 0, 4, 4, contrib.table, {
  keys: true,
  fg: "green",
  style: {
    border: {
      fg: "light-red"
    }
  },
  label: "Blockchain Indicators",
  interactive: false,
  columnSpacing: 1,
  columnWidth: [25, 20]
});

// Line chart on the right of the tables

var exchangeRateChart = grid.set(0, 4, 6, 6, contrib.line, {
  style: {
    line: "yellow",
    text: "green",
    baseline: "black"
  },
  xLabelPadding: 3,
  xPadding: 5,
  // showLegend: true,
  wholeNumbersOnly: true,
  label: "Exchange Rate"
});

// Countdown under chart

var countdown = grid.set(6, 4, 3, 3, contrib.lcd, {
  segmentWidth: 0.06,
  segmentInterval: 0.10,
  strokeWidth: 0.1,
  elements: 4,
  display: "0000",
  elementSpacing: 4,
  elementPadding: 2,
  color: "white", // color for the segments
  label: "Minutes Until Next Trade",
  style: {
    border: {
      fg: "light-blue"
    },
  },
})

var logs = grid.set(6, 7, 5, 4, blessed.box, {
  label: "DEBUGGING LOG",
  top: 0,
  left: 0,
  height: "100%-1",
  width: "100%",
})

let menubar = blessed.listbar({
  parent: screen,
  mouse: true,
  keys: true,
  bottom: 0,
  left: 0,
  height: 1,
  style: {
    item: {
      fg: "yellow"
    },
    selected: {
      fg: "yellow"
    },
  },
  commands: {
    "Autotrading Settings": {
      keys: ["t", "T"],
      callback: () => {
        showAutotradingToggle();
      }
    },
    "Refresh Data": {
      keys: ["r", "R"],
      callback: () => {
        log("Refresh Data");
        // refreshData()
      }
    },
    "Bitstamp Login": {
      keys: ["l", "L"],
      callback: () => {
        log("Login")
        displayLoginScreen();
      }
    },
    "Clear Credentials": {
      keys: ["c", "C"],
      callback: () => {
        log("Clear Credentials");
        clearCredentials();
      }
    },
    "Buy BTC": {
      keys: ["b", "B"],
      callback: () => {
        log("Buy BTC");
        transaction.createBuyTransactionPopup(screen, function() {
          // TODO: Pass buy order to backend
        });
      }
    },
    "Sell BTC": {
      keys: ["s", "S"],
      callback: () => {
        log("Sell BTC");
        transaction.createSellTransactionPopup(screen, function() {
          // TODO: Pass sell order to backend
        });
      }
    },
    "Focus on Headlines": {
      keys: ["f", "F"],
      callback: () => {
        headlinesTable.focus();
      }
    },
    "Open": {
      keys: ["o", "O"],
      callback: () => {
        openArticle();
      }
    },
    "Show Help": {
      keys: ["h", "H"],
      callback: () => {
        log("Help Menu Opened");
        help.createHelpScreen(screen, VERSION);
      }
    },
    "Exit": {
      keys: ["C-c", "escape"],
      callback: () => process.exit(0)
    }
  }
})

// Resizing
screen.on("resize", function() {
  technicalIndicatorsTable.emit("attach");
  blockchainIndicatorsTable.emit("attach");
  headlinesTable.emit("attach");
  exchangeRateChart.emit("attach");
  countdown.emit("attach");
  menubar.emit("attach");
});

// Quit
screen.key(["escape", "C-c"], function(ch, key) {
  return process.exit(0);
});

// -----------------
// WORKING WITH DATA
// -----------------

let headlineData = {
  "name": "HEADLINES",
  "data": [
    ['8/9', 'Canada to tax bitcoin users', '0.10'],
    ['10/22', 'Google Ventures invests in Bitcoin ', '0.21'],
    ['3/9', 'Canada to tax bitcoin users', '0.23'],
    ['6/9', 'Canada to tax bitcoin users', '0.08'],
    ['3/15', 'Bitcoin is bad news for stability', '0.10'],
    ['4/15', 'Google Ventures invests in Bitcoin ', '0.08'],
    ['10/7', 'WikiLeaks\' Assange hypes bitcoin in', '0.36'],
    ['3/4', 'Canada to tax bitcoin users', '0.54'],
    ['11/27', 'Are alternative Ecoins \'anti-bitcoi', '0.07'],
    ['10/30', 'Google Ventures invests in Bitcoin ', '0.68'],
    ['9/14', 'Canada to tax bitcoin users', '0.74'],
    ['6/24', 'Google Ventures invests in Bitcoin ', '0.55'],
    ['4/5', 'Zerocoin\'s widget promises Bitcoin ', '0.47'],
    ['12/4', 'WikiLeaks\' Assange hypes bitcoin in', '0.17'],
    ['7/30', 'Google Ventures invests in Bitcoin ', '0.36'],
    ['5/4', 'WikiLeaks\' Assange hypes bitcoin in', '0.19']
  ]
}

let blockchainData = {
  "name": "BLOCKCHAIN_DATA",
  "data": [
    ["Confirmation Time", "14.45"],
    ["Block Size", "1.0509867022900001"],
    ["Transaction Cost", "53.2590456155"],
    ["Difficulty", "5949437371610.0"],
    ["Transactions per Day", "218607.0"],
    ["Hash Rate (GH/s)", "38743005.8012"],
    ["Market Capitalization", "120942650691.00003"],
    ["Miners Revenue", "11517945.75"],
    ["Transactions per Block", "1668.75572519"],
    ["Unique Addresses", "452409.0"],
    ["Total Bitcoin", "17194350.0"],
    ["Transaction Fees", "124854.43486300002"]
  ]
}

let technicalData = {
  "name": "TECHNICAL_INDICATORS",
  "data": [
    ['Rate of Change Ratio', 'Val', 'BUY'],
    ['Momentum', 'Val', 'SELL'],
    ['Avg Directional Index', 'Val', 'BUY'],
    ['Williams %R', 'Val', 'SELL'],
    ['Relative Strength Index', 'Val', 'BUY'],
    ['Moving Avg Convergence Divergence', 'Val', 'SELL'],
    ['Avg True Range', 'Val', 'SELL'],
    ['On-Balance Volume', 'Val', 'BUY'],
    ['Triple Exponential Moving Avg', 'Val', 'SELL']
  ]
}

let priceData = {
  "fetching": false,
  "data": [{
      "last": "6319.35",
      "high": "6494.13000000",
      "low": "6068.52000000",
      "open": 6240.49,
      "volume": "6708.87922004",
      "timestamp": "1534060816"
    },
    {
      "last": "6317.89",
      "high": "6494.13000000",
      "low": "6068.52000000",
      "open": 6240.49,
      "volume": "6709.53131157",
      "timestamp": "1534060732"
    }
  ]
}

// -----------------------
// DATA FETCHING FUNCTIONS
// -----------------------

function getBlockchainData() {
  readJsonFile(paths.blockchainDataPath, (blockchainData) => {
    // log(blockchainData)
    return blockchainData;
  });
}

function getHeadlineData() {
  readJsonFile(paths.headlineDataPath, (headlineData) => {
    // TODO: Trim headlines if too long.
    // headlines.map(str => trimIfLongerThan(str, MAX_HEADLINE_LENTH));
    // log(headlineData);
    return headlineData;

  });
}

function gettechnicalData() {
  readJsonFile(paths.technicalDataPath, (technicalData) => {
    // log(technicalData);
    return technicalData;
  });
}

function getPriceData() {
  readJsonFile(paths.priceDataPath, (data) => {
    // console.log(priceData);
    return priceData;
  });
}

function getRandomInteger(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

let exchangeRateSeries = {
  title: "Exchange Rate",
  x: [...Array(100).keys()].map((key) => {
    return String(key) + ":00"
  }),
  y: [...Array(100).keys()].map((key) => {
    return key * getRandomInteger(750, 1200)
  })
}

// console.log("Technical Indicators");
// console.log(technicalData);
// console.log("Blockchain Indicators");
// console.log(blockchainData);
// console.log("Headline Data");
// console.log(headlineData);
// console.log("Price Data");
// console.log(priceData);

function setLineData(mockData, line) {
  for (var i = 0; i < mockData.length; i++) {
    var last = mockData[i].y[mockData[i].y.length - 1];
    mockData[i].y.shift();
    var num = Math.max(last + Math.round(Math.random() * 10) - 5, 10);
    mockData[i].y.push(num);
  }
  line.setData(mockData);
}

/**
 * Gets updated data for blockchain, technical indicators, headlines and price.
 */
function refreshData(callback) {
  headlineData = getHeadlineData();
  technicalData = gettechnicalData();
  blockchainData = getBlockchainData();
  priceData = getPriceData();
  callback(headlineData, technicalData, blockchainData, priceData);
}

/**
 * Set all tables with data.
 */
function setAllTables(headlines, technicals, blockchains, prices) {
  console.log("setAllTables");
  console.log(headlines);
  console.log(technicalData);
  console.log(blockchainData);
  headlinesTable.setData({
    headers: ["Date", "Title", "Sentiment"],
    data: headlines.data
  });

  technicalIndicatorsTable.setData({
    headers: ["Name", "Value", "Signal"],
    data: technicals.data
  });

  blockchainIndicatorsTable.setData({
    headers: ["Name", "Value"],
    data: blockchains.data
  });

  screen.render();
  console.log("setAllTables COMPLETE");
}

/**
 * Set exchange rate chart with data.
 * TODO: Fix this.
 */
function setChart() {
  console.log("setChart CALLED")
  setLineData([exchangeRateSeries], exchangeRateChart)

  setInterval(function() {
    setLineData([exchangeRateSeries], exchangeRateChart)
    screen.render()
  }, 500)
}

/**
 * Take care of things that need to be done when the app is started.
 */
function start() {
  createConfigIfNeeded();
  setAllTables(headlineData, technicalData, blockchainData, priceData);
  setChart();
  headlinesTable.focus();
  screen.render();

  // BUG: setAllTables in here causes everything to crash. No ideas.
  setInterval(function() {
    log("RESETTING")
    refreshData(setAllTables)
  }, 500)
}

start();
