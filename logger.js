var ac = require("@atomist/automation-client");

automationClient = function () {
    var client = {};
    client.logger = ac.logger;
    return client;
};