# nodejs-redis-blog
This is simple blog, where user can register, upload photo, write blog and can see recent 5 blog posts of any one. This blog application is created using nodeJS and redis cache (hash &amp; list).

#Install Node and Redis
Go to http://nodejs.org and install NodeJS

Go to http://redis.io/download and install Redis

#Run Locally
Install all the dependencies:
```sh
npm install (prefix this with sudo if you are on Mac system)
```

Run the app:
```sh
node server.js
```

Then navigate to ``` http://localhost:3000 ```

#Note: 
Please create empty folder tmp in your root directory. Files are uploaded at tmp folder first after that they are moved to public/images directory.( You can customize this file location as per your need.)
