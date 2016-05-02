var express = require('express');
var http = require('http');
var validator = require("validator");
var bodyParser = require('body-parser');
var crypto = require('crypto');
var redis = require('redis');
var events = require('events')
var session = require('express-session');
var redisStore = require('connect-redis')(session);
var multer = require('multer');
var fs = require("fs");
var path = require("path");
var async = require("async");
var helpers = require('express-helpers')();

var app = express();
var server = http.createServer(app);
var emmiter= new events.EventEmitter();

var client = redis.createClient();

app.use('/public', express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

app.locals.link_to = helpers.link_to;

app.use(session({
  secret: "topSecrete",
  store: new redisStore({host:'localhost',port:6379,client:client}),
  saveUninitialized:false,
  resave:false
}));

app.locals.dbType = "Redis";
app.set('view engine', 'ejs');
app.set('view options', { layout: false });

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './tmp/')
  },
  filename: function (req, file, cb) {
    crypto.pseudoRandomBytes(16, function (err, raw) {
      //cb(null, raw.toString('hex') + Date.now() + '.' + mime.extension(file.mimetype));
      cb(null, raw.toString('hex') + Date.now() + '.jpg');
    });
  }
});

var upload = multer({ storage: storage });

/* This request is called when root page is requested.
  if session is expired render login page.
  else render picture page.
*/
app.get('/', function (req, res) {
  if(req.session.userId){
    res.render('picture');
  }else{
    res.render('index');  
  }
});

/*
  This request is called when user is redirected to picture page.
*/
app.get('/blog/picture',function(req,res){
  if(req.session.userId){
    res.render('picture');
  }else{
    res.render('index');
  }  
});


/*
  This request is called when user is redirected to register page.
*/
app.get('/blog/register',function(req,res){

  client.hmget(req.session.emailAddress,"firstname","lastname","profilePhoto",function(err,resC){
      if(err){
        throw err;
      }else{
        var response = {
          'fullName': resC[0]+" "+resC[1],
          'emailAddress': req.session.emailAddress,
          'profilePhoto': resC[2],
          'message': "Profie picture uploaded successfully."
        };
        
        if(req.session.userId){
          if(resC[2] == ""){
            res.render('picture');  
          }else{
            res.redirect('/profile');  
          }
          
        }else{
          res.render('register');
        }  
      }
    });  
});

/*
* This request get profile information.
*/
app.get('/profile',function(req,res){

if(req.session.userId){
  async.waterfall([
  function getProfileInformation(profileCallback){
     
    client.hmget(req.session.emailAddress,"firstname","lastname","profilePhoto",function(err,resC){
      if(err){
        profileCallback(err);
      }else{
        var response = {
          'fullName': resC[0]+" "+resC[1],
          'emailAddress': req.session.emailAddress,
          'profilePhoto': resC[2],
          'message': "Profie picture uploaded successfully."
        };

        profileCallback(null,response,res);
      }
    });
  },
  getRecentBlogsList,getRecentBlogs
  ],function(err){
    console.log("some error occured"+err);
  });
}else{
  res.render('index');
}       

});

/*
* This request gets blog information.
*/
app.get('/blog/:id',function(req,res){
  if(req.session.userId){
      var blogId = req.params.id;
      client.hmget(blogId,"title","content",function(reqB,resB){
          var blogInfo = {
              title: resB[0],
              content: resB[1]
          }
        res.render('blog',blogInfo);
      });
    }else{
      res.render('index');
    }  
});

/*
* This request checks if session exist then redirect user to create-blog page otherwise login page is displayed.
*/
app.get('/createBlog',function(req,res){
  if(req.session.userId){
    res.render('create-blog')
  }else{
    res.render('index');
  }
});

/*

  This request is called when user redirected to logout page.
*/
app.get('/logout',function(req,res){
  req.session.destroy(function(err){
      if(err){
        console.log(err);
      }else{
        res.redirect('/');
      }
  });
});


/* 
  This request is called when user submits login credentials.
*/
app.post('/blog/login', function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    
    client.hmget(req.body.username,"userId","emailAddress","password","salt", function (err, obj) {
        if(obj[1] == username)
        {
          crypto.pbkdf2(password,obj[3],7000,256, function(err,hash){
              if(err){
                console.log(err);
              }

              hashPassword = new Buffer(hash).toString('hex');

              if(hashPassword == obj[2]){
                req.session.userId = obj[0];
                req.session.emailAddress = req.body.username;
                res.send({'error': "false",'message':"Successfully logged in."});
                res.end();
              }else{
                res.send({'error': "true",'message':"Invalid login details"});
                res.end();
              }
          });
        }else{
                res.send({'error': "true",'message':"Invalid login details"});
                res.end();
        }  
    });
    
});

/*
* Follwing post request is called where user writes and submits blog post.
*/
app.post('/createBlog',function(req,res){
  if(req.session.userId){
    var content = req;
    async.waterfall([
      function createBlog(createBlogCallback){
        var blogId= guid();
        req.body.blogId = blogId;
        req.body.userId = req.session.userId;

        client.hmset('blog_'+blogId,req.body,function(errB,resB){
            if(errB){
              createBlogCallback(errB);
            }else{
              client.lpush('recentblogs','blog_'+blogId);
              res['message'] = "Blog created successfully.";
              createBlogCallback(null,req.session.emailAddress,res);
            }
        });
      }

      ,getProfile,getRecentBlogsList,getRecentBlogs],
        function(err){
          console.log("some error occured");
        }
    );
  }else{
    res.render('index');
  }
});


/* 
  This request is called when user submits register details.
*/
app.post('/blog/register',function(req,res){

    var firstname = req.body.firstname;
    var lastname = req.body.lastname;
    var emailAddress = req.body.emailAddress;
    var password = req.body.password;
    var confirmPassword = req.body.confirmPassword;

    var success = true;
    var errorMessage = {};
    if(validator.isNull(firstname) || !validator.isAlpha(firstname)){
        success = false;
        errorMessage.firstname ='firstname is not valid.';
    }

    if(validator.isNull(lastname) || !validator.isAlpha(lastname)){
         success = false;
        errorMessage.lastname = 'lastname is not valid.';
    }        

    if(validator.isNull(emailAddress) || !validator.isEmail(emailAddress)){
        success = false;
        errorMessage.emailAddress = 'emailAddress is not valid.';
    }

    if(validator.isNull(password) || !validator.isLength(password,0,16)){
        success = false;
        errorMessage.password = 'password is not valid.';
    }

    if(validator.isNull(confirmPassword) ||  password != confirmPassword){
        success = false;
        errorMessage.confirmPassword = 'Confirm Password is not valid.';
    }

    if(!success){
      res.send({'success' : success, 'errors':errorMessage});
    }else{
       client.hmget(emailAddress,"emailAddress",function (err,obj) {
          if(obj[0] == emailAddress){
            errorMessage.emailAddress = 'EmailAddress is is already registered.';
            res.send({'success' : false, 'errors':errorMessage});
          }else{
            emmiter.emit("register",req,res);
          }
      });
    }
});

/*
*  When user sends request to profile picture upload then following post request is executed.
*/
app.post('/file_upload',upload.any(), function (req, res) {
  if(req.session.userId){
    // get the temporary location of the file
    var tmp_path = './tmp/' +req.files[0].filename;
    // set where the file should actually exists - in this case it is in the "images" directory
    var target_path = './public/images/' + req.files[0].filename;
    // move the file from the temporary location to the intended location
    fs.rename(tmp_path, target_path, function(err) {
        if (err) throw err;
        // delete the temporary file, so that the explicitly set temporary upload dir does not get filled with unwanted files
        fs.unlink(tmp_path, function() {
            if (err) throw err;
        });
    });
    
    normalizedPath= path.normalize(req.files[0].path);
    client.hmset(req.session.emailAddress, 'profilePhoto', target_path);
    res.redirect('/profile');
  }else{
    res.render('index');
  }
});


/* 
  This event is triggered when all validation is performed.
*/
emmiter.on("register",function(req,res){

  crypto.randomBytes(128,function(err,salt){
        if(err) throw err;
          salt = new Buffer(salt).toString('hex');
          crypto.pbkdf2(req.body.password,salt,7000,256,function(err,hash){
            hashPassword = new Buffer(hash).toString('hex');

            var userid= guid();

            req.body.userId = userid;
            req.body.password = hashPassword;
            req.body.salt = salt;
            delete req.body.confirmPassword

            client.hmset(req.body.emailAddress, req.body);
            req.session.userId = req.body.userId;
            req.session.emailAddress = req.body.emailAddress;

            res.send({'success' : "true", 'message': "Registration is successfully done."});
            res.end();

          });
      });
});

/*
*  This is function used in async waterfall model to get information about profile.
*/
function getProfile(emailAddress,resMain,profileCallback){
     
    client.hmget(emailAddress,"firstname","lastname","profilePhoto","emailAddress",function(err,res){
        if(err){
          profileCallback(err);
        }else{  
          res['fullName'] = res[0]+ " "+ res[1];
          res['emailAddress']=  res[3];
          res['profilePhoto']=  res[2];
          res['message']=  "";

          profileCallback(null,res,resMain);
        }
    });
}

/*
* This is function used in async waterfall model to get recent 5 blog ids.
*/
function getRecentBlogsList(profileData,resMain,recentBlogListCallback){
    
    client.lrange('recentblogs',0,-1,function(err,res){
      if(err){
        recentBlogListCallback(err);
      }else{
        recentBlogListCallback(null,profileData,res,resMain);
      }
    });
}

/*
* This is function used in async waterfall model to get recent 5 blog information.
*/
function getRecentBlogs(profileData,recentBlogs,resMain,recentBlogsCallback){
     
      var length = client.llen('recentblogs',function(errl,resl){
          if(errl){
            recentBlogsCallback(errl);
          }else{
            if(resl == 0)
            {
              profileData['blogData'] = "";
              profileData['message'] = "";
              resMain.render('profile',profileData);
            }else{    
              var BlogData = [];

              recentBlogs.map(function(item) {
                
                client.hmget(item,"title","content",function(err,res){

                if(err){
                  recentBlogsCallback(err);
                }else{var blog = [];
                  blog['blogId'] = item;
                  blog['title'] = res[0];
                  blog['content'] = res[1];  
                  
                  BlogData.push(blog);
 
                  if(recentBlogs[resl-1] == item){
                    profileData['message'] = resMain["message"];
                    profileData['blogData'] = BlogData;
                    resMain.render('profile', profileData);
                  }
                } 

              });
            });
          }
          }  
      });
}

/* 
  This function generates unique user id.
*/
function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
  });
 }

server.listen(process.env.PORT || 3000);
