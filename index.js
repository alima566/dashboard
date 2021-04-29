const Discord = require("discord.js");
const mongoose = require("mongoose");

const client = new Discord.Client({
  partials: ["MESSAGE", "CHANNEL", "REACTION", "USER", "GUILD_MEMBER"],
  intents: [
    Discord.Intents.FLAGS.GUILDS,
    Discord.Intents.FLAGS.GUILD_MESSAGES,
    Discord.Intents.FLAGS.GUILD_MEMBERS,
  ],
});

client.config = require("./config");

require("./util/functions.js")(client);

client.owners = new Array();

mongoose.connect(client.config.mongoPath, {
  keepAlive: true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

client.on("ready", async () => {
  console.log("Ready and fetching members...");
  for (const [id, guild] of client.guilds.cache) {
    await guild.members.fetch();
  }

  client.application = await client.fetchApplication();
  if (client.owners.length < 1)
    client.application.team
      ? client.owners.push(...client.application.team.members.keys())
      : client.owners.push(client.application.owner.id);

  setInterval(async () => {
    client.owners = [];
    client.application = await client.fetchApplication();
    client.application.team
      ? client.owners.push(...client.application.team.members.keys())
      : client.owners.push(client.application.owner.id);
  }, 60000);

  console.log("Members fetched.");
  console.log(`Logged in as ${client.user.tag}`);

  require("./util/dashboard")(client);
});

client.login(client.config.token);
