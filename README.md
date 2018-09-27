## sendowl-licenses

### Setup for local env
```
# install node.js

# install mongodb

# run first time init commands
<see init section below>
```

### Setup for docker users

```
# build the server and db images
./docker/build.sh

# run first time init commands
<see init section below>

# run the server and db
./docker/start.sh

# stop the server and db
./docker/stop.sh

# run a server console
./docker/console.sh

# run a db console
./docker/db-console.sh
```

### First time init
#### (either from shell or docker console)
```
# copy your dotenv
cp example.env .env

# edit your .env
code/vi/nano .env

# either from shell or docker server console
npm install

# initialize database
node db/init.js
```

### Utilities and maintenance

```
# init dev database
node ./db/init.js

# drop dev database
node ./db/drop.js

# init dev database
node ./db/init.js
```