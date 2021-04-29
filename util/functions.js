module.exports = (client) => {
  // getSettings merges the client defaults with the guild settings. guild settings in
  // enmap should only have *unique* overrides that are different from defaults.
  client.getSettings = (guild) => {
    // This line coupled with the defaultSettings defined above will always make sure
    // the bot is functional, if a user deletes the default settings from the database
    // ensuring the data will re-set those defaults.
    client.settings.ensure("default", defaultSettings);
    return {
      ...(client.settings.get("default") || {}),
      ...((guild && client.settings.get(guild.id)) || {}),
    };
  };

  Object.defineProperty(String.prototype, "toProperCase", {
    value: function () {
      return this.replace(
        /([^\W_]+[^\s-]*) */g,
        (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );
    },
  });
};
