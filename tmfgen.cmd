@echo off
rem Wrapper so tmfgen can be run from the repo root, e.g.:
rem   tmfgen ir documents\tmf670\4.0.0
rem instead of:
rem   cd generator && node src\cli.mjs ir --component ..\documents\tmf670\4.0.0
node "%~dp0generator\src\cli.mjs" %*
