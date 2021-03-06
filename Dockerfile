FROM node:11.6-alpine

# Configure required environment
ENV NODE_ENV prod

# Intall system deps
RUN apk --no-cache add --virtual native-deps build-base python2 postgresql-dev

# Copy all application files
COPY . .

# Remove deps
RUN rm node_modules docker.env -Rf

# Install deps
RUN npm install

# Run app
CMD npm start
