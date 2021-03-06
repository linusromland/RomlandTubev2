//Imports depedencies and others files
const express = require("express"),
  bodyParser = require("body-parser"),
  mongoose = require("mongoose"),
  app = express(),
  port = 3000,
  User = require("./models/User.js"),
  Video = require("./models/Video.js"),
  dBModule = require("./dbModule"),
  cookieParser = require("cookie-parser"),
  eescape = require("escape-html"),
  upload = require("express-fileupload"),
  mime = require("mime-types"),
  fs = require("fs"),
  probe = require("probe-image-size"),
  ffmpeg = require("fluent-ffmpeg"),
  mkdirp = require("mkdirp"),
  sharp = require("sharp"),
  { fileURLToPath } = require("url"),
  clientDir = __dirname + "/client/";

/*Enables JSON, Cookies, extended for express and 
creates a static path for CSS etc */
app.use(express.json());
app.use(cookieParser());
app.use(upload());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(clientDir));
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

//Enables EJS
app.set("view engine", "ejs");

//Connect to Mongo
if (fs.existsSync("mongoauth.json")) {
  dBModule.cnctDBAuth("RomlandTube");
} else {
  dBModule.cnctDB("RomlandTube");
}

// GET ROUTES

app.get("/", (req, res) => {
  let name = "Not Logged in";
  let loggedin = false;
  if (req.cookies.usrName && logIn(req.cookies.usrName, req.cookies.pswd)) {
    name = req.cookies.usrName;
    loggedin = true;
  }
  fs.readdir(clientDir + "/themes", async function (err, files) {
    //handling error
    if (err) {
      return console.log("Unable to find or open the directory: " + err);
    }

    if (req.query.search) {
      res.render("index", {
        name: name,
        loggedIn: loggedin,
        videos: await searchVids(req.query.search),
        eescape: eescape,
        files: files,
      });
    } else {
      res.render("index", {
        name: name,
        loggedIn: loggedin,
        videos: await getVids(),
        eescape: eescape,
        files: files,
      });
    }
  });
});

app.get("/login", async (req, res) => {
  if (await logIn(req.cookies.usrName, req.cookies.pswd)) {
    res.redirect("/");
  } else {
    fs.readdir(clientDir + "/themes", function (err, files) {
      //handling error
      if (err) {
        return console.log("Unable to find or open the directory: " + err);
      }

      res.render("login", {
        loggedIn: false,
        files: files,
      });
    });
  }
});

app.get("/view", async (req, res) => {
  let loggedIn = false;
  let name = "Not Logged in";
  let id = req.query.id;

  //console.log(JSON.parse(getVideo(id).comments));
  if (id) {
    if (await logIn(req.cookies.usrName, req.cookies.pswd)) {
      loggedIn = true;
      name = req.cookies.usrName;
    }

    fs.readdir(clientDir + "/themes", async function (err, files) {
      //handling error
      if (err) {
        return console.log("Unable to find or open the directory: " + err);
      }
      if (mongoose.isValidObjectId(id)) {
        try {
          let video = await getVideo(id);

          fs.access("." + video.link + "/1920x1080.mp4",
            fs.constants.R_OK,
            async (err) => {
              if (err) {
                console.log(err);
                res.render("unavailable", {
                  reason: "Video has not started processing",
                });
              } else {
                var d = new Date();
                var n = d.getTime();
                if (
                  n - fs.statSync("." + video.link).mtime.getTime() >
                  5000
                ) {
                  dBModule.updateViews(Video, id);

                  res.render("view", {
                    loggedIn: loggedIn,
                    name: name,
                    files: files,
                    vid: video,
                    comments: video.comments.toJSON(),
                    eescape: eescape,
                  });
                } else {
                  res.render("unavailable", {
                    reason: "Video is still processing",
                  });
                }
              }
            }
          );
        } catch {
          res.render("unavailable", {
            reason: "Invalid video id",
          });
        }
      } else {
        res.render("unavailable", {
          reason: "Invalid video id",
        });
      }
    });
  } else {
    res.render("unavailable", {
      reason: "Invalid video id",
    });
  }
});

app.get("/register", async (req, res) => {
  if (await logIn(req.cookies.usrName, req.cookies.pswd)) {
    res.redirect("/");
  } else {
    fs.readdir(clientDir + "/themes", function (err, files) {
      //handling error
      if (err) {
        return console.log("Unable to find or open the directory: " + err);
      }

      res.render("register", {
        loggedIn: false,
        files: files,
      });
    });
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("usrName");
  res.clearCookie("pswd");
  res.redirect("/");
});

app.get("/upload", async (req, res) => {
  if (await logIn(req.cookies.usrName, req.cookies.pswd)) {
    fs.readdir(clientDir + "/themes", function (err, files) {
      //handling error
      if (err) {
        return console.log("Unable to find or open the directory: " + err);
      }

      res.render("upload", {
        name: req.cookies.usrName,
        loggedIn: true,
        eescape: eescape,
        files: files,
      });
    });
  } else {
    res.redirect("/");
  }
});

app.get("/api", async function (req, res) {
  let search = req.query.search ? req.query.search : "";
  res.send(await searchVids(search));
});

app.get("/images/*", async function (req, res) {
  let pathToFile = "." + req.path.substring(7);

  let originalSize = await probe(fs.createReadStream(pathToFile));

  let width = originalSize.width;

  //Scale imageapp.get("/images/*", async function (req, res) {
  sharp(pathToFile)
    .rotate()
    .resize(
      Math.min(req.query.size, width),
      Math.round(Math.min(parseInt(req.query.size), width) * (9 / 16))
    )
    .webp()
    .toBuffer()
    .then((data) => {
      res.write(data, "binary");
      res.end(null, "binary");
    })
    .catch((error) => {
      res.write(error.toString());
      res.end();
    });
});

//if page does not exist, redirect to /
app.get("*", function (req, res) {
  res.redirect("/");
});

// POST ROUTES

app.post("/register", async (req, res) => {
  console.log("New User Registration POST!");
  try {
    const userExist = await dBModule.findInDBOne(User, req.body.name);
    if (userExist == null) {
      dBModule.saveToDB(createUser(req.body.name, req.body.password));
      giveCookies(req, res);
      res.status(201).send();
    } else {
      return res.status(400).send("taken");
    }
  } catch {
    res.status(500).send();
  }
});

app.post("/login", async (req, res) => {
  try {
    if (await logIn(req.body.name, req.body.password)) {
      giveCookies(req, res);
      res.status(200).send();
    } else {
      res.status(401).send();
    }
  } catch (error) {
    console.log(error);
    res.status(500).send();
  }
});

app.post("/authUser", async (req, res) => {
  if (req.cookies.usrName && await logIn(req.cookies.usrName, req.cookies.pswd)) {
    res.status(200).send();
  } else {
    res.status(403).send();
  }
});

app.post('/comment', async (req, res) => {
  if (req.cookies.usrName && await logIn(req.cookies.usrName, req.cookies.pswd)) {
    createComment(req.body.id, req.body.comment, req.cookies.usrName);
    res.status(201).send();
  } else {
    res.status(403).send();
  }
})

app.post("/upload", async (_req, _res) => {
  if (await logIn(_req.cookies.usrName, _req.cookies.pswd)) {
    if (_req.files) {
      let file = _req.files;
      let videoData = _req.files.video.data;
      let thumbData = _req.files.thumb.data;

      if (
        checkFile(file.video, "video/", 150) &&
        checkFile(file.thumb, "image/", 15)
      ) {
        let videoExtention = mime.extension(file.video.mimetype);
        let thumbEnd = mime.extension(file.thumb.mimetype);
        let outpath = "./client/upload/" + _req.cookies.usrName + "-" + file.video.md5;
        let videoName = _req.cookies.usrName + "-" + file.video.md5 + "." + videoExtention;
        let videoPath = clientDir + "upload/" + videoName;
        let thumbPath = outpath + "/thumbnail." + thumbEnd
        //Create folder
        fs.mkdirSync(outpath, { recursive: true })
        //console.log(videoPath)
        fs.writeFile(videoPath, videoData, function (err) {
          if (err) {
            console.error(err);
            return;
          }
          scaleVideo(videoPath, file, outpath);
        });
        fs.writeFile(thumbPath, thumbData, function (err) {
          if (err) {
            return console.log(err);
          }
        });
        dBModule.saveToDB(
          createVideo(
            _req.body.name,
            _req.body.desc,
            outpath.substring(1),
            thumbEnd,
            _req.cookies.usrName
          )
        );
        _res.header("Content-Type", "application/json");
        _res.status(200).send();
      } else {
        _res.status(401).send();
      }
    } else {
      _res.status(500).send();
    }
  } else {
    _res.status(500).send();
  }
});

//Starts the HTTP Server on port 3000
app.listen(port, () => console.log(`Server listening on port ${port}!`));

// FUNCTIONS
function createUser(nameIN, passIN) {
  let tmp = new User({
    name: nameIN,
    password: passIN,
  });
  return tmp;
}

function createVideo(name, desc, link, thumbEnd, channel) {
  name = name.substring(0, 25);
  desc = desc.substring(0, 150);

  let tmp = new Video({
    name: name,
    desc: desc,
    link: link,
    thumbEnd: thumbEnd,
    channel: channel,
  });
  return tmp;
}

function createComment(id, comment, user) {
  let tmp = { name: user, comment: comment, likes: 0, date: Date.now() }
  dBModule.addComment(Video, id, tmp);
}

let codec = "libx264";
let resolutions = ["1920x1080", "1280x720", "640x360", "16x9"];

function scaleVideo(videoPath, file, outpath) {
  let ff = ffmpeg(videoPath);
  for (let i = 0; i < resolutions.length; i++) {
    ff.addOutput(outpath + "/" + resolutions[i] + ".mp4")
      .videoCodec(codec)
      .size(resolutions[i]);
  }
  ff.on("error", function (err) {
    console.log("An error occurred: " + err.message);
  })
    .on("progress", function (progress) {
      console.log("frames: " + progress.frames);
    })
    .on("end", function () {
      console.log("Finished processing");
      fs.unlink(videoPath, (err) => {
        if (err) {
          console.error(err)
          return
        }
        console.log("Removed the original file")
      })
    })
    .run();

  return ff;
}

async function logIn(username, password) {
  const user = await dBModule.findInDBOne(User, username);
  if (user == null) {
    return false;
  }
  if (password == user.password) {
    return true;
  } else {
    return false;
  }
}

function giveCookies(req, res) {
  res.cookie("usrName", req.body.name, {
    httpOnly: true,
    secure: true,
    sameSite: true,
    maxAge: 2147483647,
    //domain: 'romland.space'
  });
  res.cookie("pswd", req.body.password, {
    httpOnly: true,
    secure: true,
    sameSite: true,
    maxAge: 2147483647,
    //domain: 'romland.space'
  });
}

async function getVids() {
  return await dBModule.findInDB(Video, 25);
}

async function searchVids(search) {
  return await dBModule.searchInDB(Video, 1, search);
}

async function getVideo(id) {
  return await dBModule.findVideoWithID(Video, id);
}

function checkFile(file, wantedType, wantedSize) {
  let fileExtention = mime.extension(file.mimetype);
  return (
    file.size < wantedSize * 1000000 &&
    fileExtention &&
    file.mimetype.includes(wantedType)
  );
}
