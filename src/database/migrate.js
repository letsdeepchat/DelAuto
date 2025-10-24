require('dotenv').config();
require('./connection'); // Connect to MongoDB

async function runMigrations() {
  try {
    console.log('MongoDB models are defined and ready. No migrations needed.');
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
