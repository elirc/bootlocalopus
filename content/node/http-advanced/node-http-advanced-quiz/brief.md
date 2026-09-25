Between your Node process and the user sit a load balancer, maybe a CDN, and
a browser cache — each of them reading your headers literally and acting on
them. Most "HTTP bugs" are a disagreement between your server and one of
those middlemen: a timeout that is shorter on the wrong side, a cache
directive that means something other than it sounds, a retry of a request
that was not safe to repeat.

These questions are the ones that decide whether a service behaves behind
real infrastructure. Each explanation says which middleman does what.
