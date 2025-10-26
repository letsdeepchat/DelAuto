@echo off
REM Capture stderr output from npm test and redirect to errors.txt (overwrites each time)
npm test 2> errors.txt