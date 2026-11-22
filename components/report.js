const reports = require("../services/reports");

// A sent report form: "report:<draft ID>" (Report Message / Report User) or "report:g" (/report)
module.exports = {
  prefix: "report",
  level: "everyone",

  async execute(interaction, args) {
    return reports.submit(interaction, args);
  }
};
