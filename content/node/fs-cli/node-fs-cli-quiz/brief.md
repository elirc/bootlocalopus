Files and processes are where Node code meets the operating system, and the
OS does not care what you meant. A relative path resolves against wherever
the process was started. A `process.exit()` does not wait for a pipe to
drain. A check followed by an action is two system calls, and anything can
happen between them.

These questions are the situations that turn into "it works when I run it"
tickets: the script that fails only under cron, the output that is cut off
only when piped, the temp file that cannot be renamed only on the build
server. Each explanation says what the OS actually does.
