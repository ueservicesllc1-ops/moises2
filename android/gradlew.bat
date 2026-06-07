@rem Gradle wrapper script for Windows
@echo off
setlocal

set GRADLE_HOME=C:\Users\Freedom Labs\.gradle\wrapper\dists\gradle-8.9-bin\90cnw93cvbtalezasaz0blq0a\gradle-8.9
set PATH=%GRADLE_HOME%\bin;%PATH%

"%GRADLE_HOME%\bin\gradle.bat" %*
