// Loads variables from a local .env file (if present) before any other module reads process.env.
// Real environment variables take precedence over the file.
try {
  process.loadEnvFile();
} catch (error: any) {
  if (error?.code !== "ENOENT") throw error;
}
