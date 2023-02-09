FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json ./
COPY yarn.lock ./

RUN yarn

# Bundle app source
COPY . .

RUN yarn build

EXPOSE 3001
CMD [ "yarn", "start" ]