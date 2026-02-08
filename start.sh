#!/bin/bash
set -e

echo "Checking Java..."
if ! command -v java &> /dev/null
then
    echo "Java is not installed. Cannot run the JAR."
    exit 1
fi

echo "Starting Node.js script..."
node index.js
