const onError = (error) => {
  throw error;
};
process.setMaxListeners(0);
process.on('uncaughtException', onError);
process.on('unhandledRejection', onError);
