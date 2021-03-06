// Native Node Imports
const url = require("url");
const path = require("path");

// Used for Permission Resolving...
const Discord = require("discord.js");

// Express Session
const express = require("express");
const app = express();
const moment = require("moment");
const momentTZ = require("moment-timezone");
require("moment-duration-format");

// Express Plugins
// Specifically, passport helps with oauth2 in general.
// passport-discord is a plugin for passport that handles Discord's specific implementation.
// express-session and level-session-store work together to create persistent sessions
// (so that when you come back to the page, it still remembers you're logged in).
const passport = require("passport");
const session = require("express-session");
const Strategy = require("passport-discord").Strategy;
const MemoryStore = require("memorystore")(session);

// Helmet is specifically a security plugin that enables some specific, useful
// headers in your page to enhance security.
// const helmet = require("helmet");

// Used to parse Markdown from things like ExtendedHelp
const md = require("marked");

module.exports = (client) => {
  const dataDir = path.resolve(`${process.cwd()}${path.sep}dashboard`);
  const templateDir = path.resolve(`${dataDir}${path.sep}templates`);

  app.use(
    "/public",
    express.static(path.resolve(`${dataDir}${path.sep}public`))
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });
  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  passport.use(
    new Strategy(
      {
        clientID: client.application.id,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: client.config.dashboard.callbackURL,
        scope: ["identify", "guilds"],
      },
      (accessToken, refreshToken, profile, done) => {
        process.nextTick(() => done(null, profile));
      }
    )
  );

  // Session data, used for temporary storage of your visitor's session information.
  app.use(
    session({
      store: new MemoryStore({ checkPeriod: 86400000 }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
    })
  );

  // Initializes passport and session.
  app.use(passport.initialize());
  app.use(passport.session());
  //app.use(helmet());

  // The domain name used in various endpoints to link between pages.
  app.locals.domain = client.config.dashboard.domain;

  app.engine("html", require("ejs").renderFile);
  app.set("view engine", "html");

  const bodyParser = require("body-parser");
  app.use(bodyParser.json()); // to support JSON-encoded bodies
  app.use(
    bodyParser.urlencoded({
      // to support URL-encoded bodies
      extended: true,
    })
  );

  /* 
  Authentication Checks. For each page where the user should be logged in, double-checks
  whether the login is valid and the session is still active.
  */
  const checkAuth = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    req.session.backURL = req.url;
    res.redirect("/login");
  };

  // This function simplifies the rendering of the page, since every page must be rendered
  // with the passing of these 4 variables, and from a base path.
  // Objectassign(object, newobject) simply merges 2 objects together, in case you didn't know!
  const renderTemplate = async (res, req, template, data = {}) => {
    const botCreator = await client.users.fetch(client.config.ownerID);
    const baseData = {
      bot: client,
      path: req.path,
      user: req.isAuthenticated() ? req.user : null,
      creator: botCreator,
    };
    res.render(
      path.resolve(`${templateDir}${path.sep}${template}`),
      Object.assign(baseData, data)
    );
  };

  /** PAGE ACTIONS RELATED TO SESSIONS */

  // The login page saves the page the person was on in the session,
  // then throws the user to the Discord OAuth2 login page.
  app.get(
    "/login",
    (req, res, next) => {
      if (req.session.backURL) {
        next();
      } else if (req.headers.referer) {
        const parsed = url.parse(req.headers.referer);
        if (parsed.hostname === app.locals.domain) {
          req.session.backURL = parsed.path;
        }
      } else {
        req.session.backURL = "/";
      }
      next();
    },
    passport.authenticate("discord")
  );

  // Once the user returns from OAuth2, this endpoint gets called.
  // Here we check if the user was already on the page and redirect them
  // there, mostly.
  app.get(
    "/callback",
    passport.authenticate("discord", { failureRedirect: "/autherror" }),
    (req, res) => {
      client.owners.includes(req.user.id)
        ? (req.session.isAdmin = true)
        : (req.session.isAdmin = false);
      if (req.session.backURL) {
        const url = req.session.backURL;
        req.session.backURL = null;
        res.redirect(url);
      } else {
        res.redirect("/");
      }
    }
  );

  // If an error happens during authentication, this is what's displayed.
  app.get("/autherror", (req, res) => {
    renderTemplate(res, req, "autherror.ejs");
  });

  // Destroys the session to log out the user.
  app.get("/logout", function (req, res) {
    req.session.destroy(() => {
      req.logout();
      res.redirect("/"); //Inside a callback??? bulletproof!
    });
  });

  /** REGULAR INFORMATION PAGES */

  // Index page. If the user is authenticated, it shows their info at the top right of the screen.
  app.get("/", (req, res) => {
    renderTemplate(res, req, "index.ejs");
  });

  app.get("/commands", (req, res) => {
    const commands = require("../commands.json");
    renderTemplate(res, req, "commands.ejs", { commands });
  });

  // Bot statistics
  app.get("/stats", (req, res) => {
    const duration = moment
      .duration(client.uptime)
      .format(" D [days], H [hrs], m [mins], s [secs]");
    const createdAt = moment
      .tz(client.user.createdAt, "America/New_York")
      .format("ddd, MMM D, YYYY h:mm A z");
    renderTemplate(res, req, "stats.ejs", {
      stats: {
        created: createdAt,
        uptime: duration,
        dVersion: Discord.version,
      },
    });
  });

  app.get("/dashboard", checkAuth, (req, res) => {
    const perms = Discord.Permissions;
    renderTemplate(res, req, "dashboard.ejs", { perms });
  });

  // The Admin dashboard is similar to the one above, with the exception that
  // it shows all current guilds the bot is on, not *just* the ones the user has
  // access to. Obviously, this is reserved to the bot's owner for security reasons.
  app.get("/admin", checkAuth, (req, res) => {
    if (!req.session.isAdmin) return res.redirect("/");
    renderTemplate(res, req, "admin.ejs");
  });

  // Simple redirect to the "Settings" page (aka "manage")
  app.get("/dashboard/:guildID", checkAuth, (req, res) => {
    res.redirect(`/dashboard/${req.params.guildID}/manage`);
  });

  // Settings page to change the guild configuration. Definitely more fancy than using
  // the `set` command!
  app.get("/dashboard/:guildID/manage", checkAuth, async (req, res) => {
    const prefixSchema = require("../models/prefixes");
    const friendCodeSchema = require("../models/friendCodes");
    const uidSchema = require("../models/uids");
    const botChannelSchema = require("../models/botChannelLog");
    const gamblingChannelSchema = require("../models/gamblingChannels");

    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);

    const serverPrefix = await prefixSchema.findOne({ _id: guild.id });
    const ownerFriendCode = await friendCodeSchema.findOne({ _id: guild.id });
    const ownerUID = await uidSchema.findOne({ _id: guild.id });
    const botChannel = await botChannelSchema.findOne({ _id: guild.id });
    const gamblingChannel = await gamblingChannelSchema.findOne({
      _id: guild.id,
    });

    const prefix = serverPrefix ? serverPrefix.prefix : "!";
    const fc = ownerFriendCode ? ownerFriendCode.friendCode : null;
    const uid = ownerUID ? ownerUID.uid : null;
    const botLoggingChannel = botChannel ? botChannel.channelID : null;
    const gambleChannel = gamblingChannel ? gamblingChannel.channelID : null;

    const isManaged =
      guild && !!guild.member(req.user.id)
        ? guild.member(req.user.id).permissions.has("MANAGE_GUILD")
        : false;
    if (!isManaged && !req.session.isAdmin) res.redirect("/");
    renderTemplate(res, req, "guild/manage.ejs", {
      guild,
      prefix,
      fc,
      uid,
      botLoggingChannel,
      gambleChannel,
    });
  });

  // When a setting is changed, a POST occurs and this code runs
  // Once settings are saved, it redirects back to the settings page.
  // app.post("/dashboard/:guildID/manage", checkAuth, (req, res) => {
  //   const guild = client.guilds.cache.get(req.params.guildID);
  //   if (!guild) return res.status(404);
  //   const isManaged =
  //     guild && !!guild.member(req.user.id)
  //       ? guild.member(req.user.id).permissions.has("MANAGE_GUILD")
  //       : false;
  //   if (!isManaged && !req.session.isAdmin) res.redirect("/");
  //   client.writeSettings(guild.id, req.body);
  //   res.redirect("/dashboard/" + req.params.guildID + "/manage");
  // });

  // Displays the list of members on the guild (paginated).
  // NOTE: to be done, merge with manage and stats in a single UX page.
  app.get("/dashboard/:guildID/members", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    renderTemplate(res, req, "guild/members.ejs", {
      guild,
      members: guild.members.cache.array(),
    });
  });

  // This JSON endpoint retrieves a partial list of members. This list can
  // be filtered, sorted, and limited to a partial count (for pagination).
  // NOTE: This is the most complex endpoint simply because of this filtering
  // otherwise it would be on the client side and that would be horribly slow.
  app.get("/dashboard/:guildID/members/list", checkAuth, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildID);
    if (!guild) return res.status(404);
    if (req.query.fetch) {
      await guild.member.fetch();
    }
    const totals = guild.members.cache.size;
    const start = parseInt(req.query.start, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 50;
    let members = guild.members;

    if (req.query.filter && req.query.filter !== "null") {
      //if (!req.query.filtervalue) return res.status(400);
      members = members.cache.filter((m) => {
        m = req.query.filterUser ? m.user : m;
        return m["displayName"]
          .toLowerCase()
          .includes(req.query.filter.toLowerCase());
      });
    }

    if (req.query.sortby) {
      members = members.cache.sort(
        (a, b) => a[req.query.sortby] > b[req.query.sortby]
      );
    }
    const memberArray = members.array().slice(start, start + limit);

    const returnObject = [];
    for (let i = 0; i < memberArray.length; i++) {
      const m = memberArray[i];
      returnObject.push({
        id: m.id,
        status: m.user.presence.status,
        bot: m.user.bot,
        username: m.user.username,
        displayName: m.displayName,
        tag: m.user.tag,
        discriminator: m.user.discriminator,
        joinedAt: m.joinedTimestamp,
        createdAt: m.user.createdTimestamp,
        highestRole: {
          hexColor: m.roles.highest.hexColor,
        },
        memberFor: moment
          .duration(Date.now() - m.joinedAt)
          .format(" D [days], H [hrs], m [mins], s [secs]"),
        roles: m.roles.cache.map((r) => ({
          name: r.name,
          id: r.id,
          hexColor: r.hexColor,
        })),
      });
    }
    res.json({
      total: totals,
      page: start / limit + 1,
      pageof: Math.ceil(members.size / limit),
      members: returnObject,
    });
  });

  client.site = app.listen(client.config.dashboard.port);
};
