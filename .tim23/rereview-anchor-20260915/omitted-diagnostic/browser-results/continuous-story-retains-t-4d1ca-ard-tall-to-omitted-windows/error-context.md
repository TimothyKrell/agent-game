# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: continuous-story.spec.ts >> retains the pre-replacement document anchor across forward tall-to-omitted windows
- Location: e2e/continuous-story.spec.ts:457:5

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByLabel('primary timeline', { exact: true }).locator('[data-story-key="story-392621076-236"]')

```

# Page snapshot

```yaml
- main [ref=e3]:
  - status "cache entries" [ref=e4]: "0"
  - button "Refresh A" [ref=e5]
  - button "Match B" [ref=e6]
  - button "Toggle chapter" [ref=e7]
  - button "Toggle second reader" [ref=e8]
  - button "Go offline" [ref=e9]
  - button "Go online" [ref=e10]
  - region "primary" [ref=e11]:
    - status "primary metrics" [ref=e12]: "{\"after\":192,\"delivered\":320,\"head\":900,\"rows\":128,\"version\":4,\"status\":\"ready\",\"following\":false}"
    - button "Follow primary" [ref=e13]
    - button "Missing anchor primary" [ref=e14]
    - generic "primary timeline" [active] [ref=e16]:
      - article [ref=e18]:
        - button "Focus 193" [ref=e19]: "193"
        - text: Record 193. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e20]: Â· speech
      - article [ref=e22]:
        - button "Focus 194" [ref=e23]: "194"
        - text: Record 194. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e24]: Â· speech
      - article [ref=e26]:
        - button "Focus 195" [ref=e27]: "195"
        - text: Record 195. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e28]: Â· speech
      - article [ref=e30]:
        - button "Focus 196" [ref=e31]: "196"
        - text: Record 196. “Exact dialogue”
        - generic [ref=e32]: Â· speech
      - article [ref=e34]:
        - button "Focus 197" [ref=e35]: "197"
        - text: Record 197. “Exact dialogue” A longer canonical message.
        - generic [ref=e36]: Â· speech
      - article [ref=e38]:
        - button "Focus 198" [ref=e39]: "198"
        - text: Record 198. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e40]: Â· speech
      - article [ref=e42]:
        - button "Focus 199" [ref=e43]: "199"
        - text: Record 199. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e44]: Â· speech
      - article [ref=e46]:
        - button "Focus 200" [ref=e47]: "200"
        - text: Record 200. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e48]: Â· speech
      - article [ref=e50]:
        - button "Focus 201" [ref=e51]: "201"
        - text: Record 201. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e52]: Â· speech
      - article [ref=e54]:
        - button "Focus 202" [ref=e55]: "202"
        - text: Record 202. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e56]: Â· speech
      - article [ref=e58]:
        - button "Focus 203" [ref=e59]: "203"
        - text: Record 203. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e60]: Â· speech
      - article [ref=e62]:
        - button "Focus 204" [ref=e63]: "204"
        - text: Record 204. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e64]: Â· speech
      - article [ref=e66]:
        - button "Focus 205" [ref=e67]: "205"
        - text: Record 205. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e68]: Â· speech
      - article [ref=e70]:
        - button "Focus 206" [ref=e71]: "206"
        - text: Record 206. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e72]: Â· speech
      - article [ref=e74]:
        - button "Focus 207" [ref=e75]: "207"
        - text: Record 207. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e76]: Â· speech
      - article [ref=e78]:
        - button "Focus 208" [ref=e79]: "208"
        - text: Record 208. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e80]: Â· speech
      - article [ref=e82]:
        - button "Focus 209" [ref=e83]: "209"
        - text: Record 209. “Exact dialogue”
        - generic [ref=e84]: Â· speech
      - article [ref=e86]:
        - button "Focus 210" [ref=e87]: "210"
        - text: Record 210. “Exact dialogue” A longer canonical message.
        - generic [ref=e88]: Â· speech
      - article [ref=e90]:
        - button "Focus 211" [ref=e91]: "211"
        - text: Record 211. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e92]: Â· speech
      - article [ref=e94]:
        - button "Focus 212" [ref=e95]: "212"
        - text: Record 212. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e96]: Â· speech
      - article [ref=e98]:
        - button "Focus 213" [ref=e99]: "213"
        - text: Record 213. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e100]: Â· speech
      - article [ref=e102]:
        - button "Focus 214" [ref=e103]: "214"
        - text: Record 214. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e104]: Â· speech
      - article [ref=e106]:
        - button "Focus 215" [ref=e107]: "215"
        - text: Record 215. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e108]: Â· speech
      - article [ref=e110]:
        - button "Focus 216" [ref=e111]: "216"
        - text: Record 216. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e112]: Â· speech
      - article [ref=e114]:
        - button "Focus 217" [ref=e115]: "217"
        - text: Record 217. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e116]: Â· speech
      - article [ref=e118]:
        - button "Focus 218" [ref=e119]: "218"
        - text: Record 218. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e120]: Â· speech
      - article [ref=e122]:
        - button "Focus 219" [ref=e123]: "219"
        - text: Record 219. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e124]: Â· speech
      - article [ref=e126]:
        - button "Focus 220" [ref=e127]: "220"
        - text: Record 220. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e128]: Â· speech
      - article [ref=e130]:
        - button "Focus 221" [ref=e131]: "221"
        - text: Record 221. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e132]: Â· speech
      - article [ref=e134]:
        - button "Focus 222" [ref=e135]: "222"
        - text: Record 222. “Exact dialogue”
        - generic [ref=e136]: Â· speech
      - article [ref=e138]:
        - button "Focus 223" [ref=e139]: "223"
        - text: Record 223. “Exact dialogue” A longer canonical message.
        - generic [ref=e140]: Â· speech
      - article [ref=e142]:
        - button "Focus 224" [ref=e143]: "224"
        - text: Record 224. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e144]: Â· speech
      - article [ref=e146]:
        - button "Focus 225" [ref=e147]: "225"
        - text: Record 225. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e148]: Â· speech
      - article [ref=e150]:
        - button "Focus 226" [ref=e151]: "226"
        - text: Record 226. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e152]: Â· speech
      - article [ref=e154]:
        - button "Focus 227" [ref=e155]: "227"
        - text: Record 227. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e156]: Â· speech
      - article [ref=e158]:
        - button "Focus 228" [ref=e159]: "228"
        - text: Record 228. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e160]: Â· speech
      - article [ref=e162]:
        - button "Focus 229" [ref=e163]: "229"
        - text: Record 229. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e164]: Â· speech
      - article [ref=e166]:
        - button "Focus 230" [ref=e167]: "230"
        - text: Record 230. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e168]: Â· speech
      - article [ref=e170]:
        - button "Focus 231" [ref=e171]: "231"
        - text: Record 231. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e172]: Â· speech
      - article [ref=e174]:
        - button "Focus 232" [ref=e175]: "232"
        - text: Record 232. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e176]: Â· speech
      - article [ref=e178]:
        - button "Focus 233" [ref=e179]: "233"
        - text: Record 233. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e180]: Â· speech
      - article [ref=e182]:
        - button "Focus 234" [ref=e183]: "234"
        - text: Record 234. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e184]: Â· speech
      - article [ref=e186]:
        - button "Focus 235" [ref=e187]: "235"
        - text: Record 235. “Exact dialogue”
        - generic [ref=e188]: Â· speech
      - article [ref=e190]:
        - button "Focus 236" [ref=e191]: "236"
        - text: Record 236. “Exact dialogue” A longer canonical message.
        - generic [ref=e192]: Â· speech
      - article [ref=e194]:
        - button "Focus 237" [ref=e195]: "237"
        - text: Record 237. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e196]: Â· speech
      - article [ref=e198]:
        - button "Focus 238" [ref=e199]: "238"
        - text: Record 238. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e200]: Â· speech
      - article [ref=e202]:
        - button "Focus 239" [ref=e203]: "239"
        - text: Record 239. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e204]: Â· speech
      - article [ref=e206]:
        - button "Focus 240" [ref=e207]: "240"
        - text: Record 240. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e208]: Â· speech
      - article [ref=e210]:
        - button "Focus 241" [ref=e211]: "241"
        - text: Record 241. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e212]: Â· speech
      - article [ref=e214]:
        - button "Focus 242" [ref=e215]: "242"
        - text: Record 242. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e216]: Â· speech
      - article [ref=e218]:
        - button "Focus 243" [ref=e219]: "243"
        - text: Record 243. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e220]: Â· speech
      - article [ref=e222]:
        - button "Focus 244" [ref=e223]: "244"
        - text: Record 244. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e224]: Â· speech
      - article [ref=e226]:
        - button "Focus 245" [ref=e227]: "245"
        - text: Record 245. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e228]: Â· speech
      - article [ref=e230]:
        - button "Focus 246" [ref=e231]: "246"
        - text: Record 246. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e232]: Â· speech
      - article [ref=e234]:
        - button "Focus 247" [ref=e235]: "247"
        - text: Record 247. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e236]: Â· speech
      - article [ref=e238]:
        - button "Focus 248" [ref=e239]: "248"
        - text: Record 248. “Exact dialogue”
        - generic [ref=e240]: Â· speech
      - article [ref=e242]:
        - button "Focus 249" [ref=e243]: "249"
        - text: Record 249. “Exact dialogue” A longer canonical message.
        - generic [ref=e244]: Â· speech
      - article [ref=e246]:
        - button "Focus 250" [ref=e247]: "250"
        - text: Record 250. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e248]: Â· speech
      - article [ref=e250]:
        - button "Focus 251" [ref=e251]: "251"
        - text: Record 251. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e252]: Â· speech
      - article [ref=e254]:
        - button "Focus 252" [ref=e255]: "252"
        - text: Record 252. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e256]: Â· speech
      - article [ref=e258]:
        - button "Focus 253" [ref=e259]: "253"
        - text: Record 253. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e260]: Â· speech
      - article [ref=e262]:
        - button "Focus 254" [ref=e263]: "254"
        - text: Record 254. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e264]: Â· speech
      - article [ref=e266]:
        - button "Focus 255" [ref=e267]: "255"
        - text: Record 255. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e268]: Â· speech
      - article [ref=e270]:
        - button "Focus 256" [ref=e271]: "256"
        - text: Record 256. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e272]: Â· speech
      - article [ref=e274]:
        - button "Focus 257" [ref=e275]: "257"
        - text: Record 257. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e276]: Â· speech
      - article [ref=e278]:
        - button "Focus 258" [ref=e279]: "258"
        - text: Record 258. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e280]: Â· speech
      - article [ref=e282]:
        - button "Focus 259" [ref=e283]: "259"
        - text: Record 259. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e284]: Â· speech
      - article [ref=e286]:
        - button "Focus 260" [ref=e287]: "260"
        - text: Record 260. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e288]: Â· speech
      - article [ref=e290]:
        - button "Focus 261" [ref=e291]: "261"
        - text: Record 261. “Exact dialogue”
        - generic [ref=e292]: Â· speech
      - article [ref=e294]:
        - button "Focus 262" [ref=e295]: "262"
        - text: Record 262. “Exact dialogue” A longer canonical message.
        - generic [ref=e296]: Â· speech
      - article [ref=e298]:
        - button "Focus 263" [ref=e299]: "263"
        - text: Record 263. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e300]: Â· speech
      - article [ref=e302]:
        - button "Focus 264" [ref=e303]: "264"
        - text: Record 264. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e304]: Â· speech
      - article [ref=e306]:
        - button "Focus 265" [ref=e307]: "265"
        - text: Record 265. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e308]: Â· speech
      - article [ref=e310]:
        - button "Focus 266" [ref=e311]: "266"
        - text: Record 266. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e312]: Â· speech
      - article [ref=e314]:
        - button "Focus 267" [ref=e315]: "267"
        - text: Record 267. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e316]: Â· speech
      - article [ref=e318]:
        - button "Focus 268" [ref=e319]: "268"
        - text: Record 268. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e320]: Â· speech
      - article [ref=e322]:
        - button "Focus 269" [ref=e323]: "269"
        - text: Record 269. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e324]: Â· speech
      - article [ref=e326]:
        - button "Focus 270" [ref=e327]: "270"
        - text: Record 270. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e328]: Â· speech
      - article [ref=e330]:
        - button "Focus 271" [ref=e331]: "271"
        - text: Record 271. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e332]: Â· speech
      - article [ref=e334]:
        - button "Focus 272" [ref=e335]: "272"
        - text: Record 272. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e336]: Â· speech
      - article [ref=e338]:
        - button "Focus 273" [ref=e339]: "273"
        - text: Record 273. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e340]: Â· speech
      - article [ref=e342]:
        - button "Focus 274" [ref=e343]: "274"
        - text: Record 274. “Exact dialogue”
        - generic [ref=e344]: Â· speech
      - article [ref=e346]:
        - button "Focus 275" [ref=e347]: "275"
        - text: Record 275. “Exact dialogue” A longer canonical message.
        - generic [ref=e348]: Â· speech
      - article [ref=e350]:
        - button "Focus 276" [ref=e351]: "276"
        - text: Record 276. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e352]: Â· speech
      - article [ref=e354]:
        - button "Focus 277" [ref=e355]: "277"
        - text: Record 277. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e356]: Â· speech
      - article [ref=e358]:
        - button "Focus 278" [ref=e359]: "278"
        - text: Record 278. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e360]: Â· speech
      - article [ref=e362]:
        - button "Focus 279" [ref=e363]: "279"
        - text: Record 279. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e364]: Â· speech
      - article [ref=e366]:
        - button "Focus 280" [ref=e367]: "280"
        - text: Record 280. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e368]: Â· speech
      - article [ref=e370]:
        - button "Focus 281" [ref=e371]: "281"
        - text: Record 281. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e372]: Â· speech
      - article [ref=e374]:
        - button "Focus 282" [ref=e375]: "282"
        - text: Record 282. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e376]: Â· speech
      - article [ref=e378]:
        - button "Focus 283" [ref=e379]: "283"
        - text: Record 283. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e380]: Â· speech
      - article [ref=e382]:
        - button "Focus 284" [ref=e383]: "284"
        - text: Record 284. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e384]: Â· speech
      - article [ref=e386]:
        - button "Focus 285" [ref=e387]: "285"
        - text: Record 285. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e388]: Â· speech
      - article [ref=e390]:
        - button "Focus 286" [ref=e391]: "286"
        - text: Record 286. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e392]: Â· speech
      - article [ref=e394]:
        - button "Focus 287" [ref=e395]: "287"
        - text: Record 287. “Exact dialogue”
        - generic [ref=e396]: Â· speech
      - article [ref=e398]:
        - button "Focus 288" [ref=e399]: "288"
        - text: Record 288. “Exact dialogue” A longer canonical message.
        - generic [ref=e400]: Â· speech
      - article [ref=e402]:
        - button "Focus 289" [ref=e403]: "289"
        - text: Record 289. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e404]: Â· speech
      - article [ref=e406]:
        - button "Focus 290" [ref=e407]: "290"
        - text: Record 290. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e408]: Â· speech
      - article [ref=e410]:
        - button "Focus 291" [ref=e411]: "291"
        - text: Record 291. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e412]: Â· speech
      - article [ref=e414]:
        - button "Focus 292" [ref=e415]: "292"
        - text: Record 292. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e416]: Â· speech
      - article [ref=e418]:
        - button "Focus 293" [ref=e419]: "293"
        - text: Record 293. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e420]: Â· speech
      - article [ref=e422]:
        - button "Focus 294" [ref=e423]: "294"
        - text: Record 294. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e424]: Â· speech
      - article [ref=e426]:
        - button "Focus 295" [ref=e427]: "295"
        - text: Record 295. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e428]: Â· speech
      - article [ref=e430]:
        - button "Focus 296" [ref=e431]: "296"
        - text: Record 296. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e432]: Â· speech
      - article [ref=e434]:
        - button "Focus 297" [ref=e435]: "297"
        - text: Record 297. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e436]: Â· speech
      - article [ref=e438]:
        - button "Focus 298" [ref=e439]: "298"
        - text: Record 298. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e440]: Â· speech
      - article [ref=e442]:
        - button "Focus 299" [ref=e443]: "299"
        - text: Record 299. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e444]: Â· speech
      - article [ref=e446]:
        - button "Focus 300" [ref=e447]: "300"
        - text: Record 300. “Exact dialogue”
        - generic [ref=e448]: Â· speech
      - article [ref=e450]:
        - button "Focus 301" [ref=e451]: "301"
        - text: Record 301. “Exact dialogue” A longer canonical message.
        - generic [ref=e452]: Â· speech
      - article [ref=e454]:
        - button "Focus 302" [ref=e455]: "302"
        - text: Record 302. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e456]: Â· speech
      - article [ref=e458]:
        - button "Focus 303" [ref=e459]: "303"
        - text: Record 303. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e460]: Â· speech
      - article [ref=e462]:
        - button "Focus 304" [ref=e463]: "304"
        - text: Record 304. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e464]: Â· speech
      - article [ref=e466]:
        - button "Focus 305" [ref=e467]: "305"
        - text: Record 305. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e468]: Â· speech
      - article [ref=e470]:
        - button "Focus 306" [ref=e471]: "306"
        - text: Record 306. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e472]: Â· speech
      - article [ref=e474]:
        - button "Focus 307" [ref=e475]: "307"
        - text: Record 307. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e476]: Â· speech
      - article [ref=e478]:
        - button "Focus 308" [ref=e479]: "308"
        - text: Record 308. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e480]: Â· speech
      - article [ref=e482]:
        - button "Focus 309" [ref=e483]: "309"
        - text: Record 309. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e484]: Â· speech
      - article [ref=e486]:
        - button "Focus 310" [ref=e487]: "310"
        - text: Record 310. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e488]: Â· speech
      - article [ref=e490]:
        - button "Focus 311" [ref=e491]: "311"
        - text: Record 311. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e492]: Â· speech
      - article [ref=e494]:
        - button "Focus 312" [ref=e495]: "312"
        - text: Record 312. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e496]: Â· speech
      - article [ref=e498]:
        - button "Focus 313" [ref=e499]: "313"
        - text: Record 313. “Exact dialogue”
        - generic [ref=e500]: Â· speech
      - article [ref=e502]:
        - button "Focus 314" [ref=e503]: "314"
        - text: Record 314. “Exact dialogue” A longer canonical message.
        - generic [ref=e504]: Â· speech
      - article [ref=e506]:
        - button "Focus 315" [ref=e507]: "315"
        - text: Record 315. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e508]: Â· speech
      - article [ref=e510]:
        - button "Focus 316" [ref=e511]: "316"
        - text: Record 316. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e512]: Â· speech
      - article [ref=e514]:
        - button "Focus 317" [ref=e515]: "317"
        - text: Record 317. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e516]: Â· speech
      - article [ref=e518]:
        - button "Focus 318" [ref=e519]: "318"
        - text: Record 318. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e520]: Â· speech
      - article [ref=e522]:
        - button "Focus 319" [ref=e523]: "319"
        - text: Record 319. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e524]: Â· speech
      - article [ref=e526]:
        - button "Focus 320" [ref=e527]: "320"
        - text: Record 320. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e528]: Â· speech
      - status
  - region "secondary" [ref=e529]:
    - status "secondary metrics" [ref=e530]: "{\"after\":0,\"delivered\":128,\"head\":900,\"rows\":128,\"version\":1,\"status\":\"ready\",\"following\":false}"
    - button "Follow secondary" [ref=e531]
    - button "Missing anchor secondary" [ref=e532]
    - generic "secondary timeline" [ref=e534]:
      - article [ref=e536]:
        - button "Focus 1" [ref=e537]: "1"
        - text: Record 1. “Exact dialogue”
        - generic [ref=e538]: Â· speech
      - article [ref=e540]:
        - button "Focus 2" [ref=e541]: "2"
        - text: Record 2. “Exact dialogue” A longer canonical message.
        - generic [ref=e542]: Â· speech
      - article [ref=e544]:
        - button "Focus 3" [ref=e545]: "3"
        - text: Record 3. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e546]: Â· speech
      - article [ref=e548]:
        - button "Focus 4" [ref=e549]: "4"
        - text: Record 4. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e550]: Â· speech
      - article [ref=e552]:
        - button "Focus 5" [ref=e553]: "5"
        - text: Record 5. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e554]: Â· speech
      - article [ref=e556]:
        - button "Focus 6" [ref=e557]: "6"
        - text: Record 6. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e558]: Â· speech
      - article [ref=e560]:
        - button "Focus 7" [ref=e561]: "7"
        - text: Record 7. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e562]: Â· speech
      - article [ref=e564]:
        - button "Focus 8" [ref=e565]: "8"
        - text: Record 8. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e566]: Â· speech
      - article [ref=e568]:
        - button "Focus 9" [ref=e569]: "9"
        - text: Record 9. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e570]: Â· speech
      - article [ref=e572]:
        - button "Focus 10" [ref=e573]: "10"
        - text: Record 10. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e574]: Â· speech
      - article [ref=e576]:
        - button "Focus 11" [ref=e577]: "11"
        - text: Record 11. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e578]: Â· speech
      - article [ref=e580]:
        - button "Focus 12" [ref=e581]: "12"
        - text: Record 12. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e582]: Â· speech
      - article [ref=e584]:
        - button "Focus 13" [ref=e585]: "13"
        - text: Record 13. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e586]: Â· speech
      - article [ref=e588]:
        - button "Focus 14" [ref=e589]: "14"
        - text: Record 14. “Exact dialogue”
        - generic [ref=e590]: Â· speech
      - article [ref=e592]:
        - button "Focus 15" [ref=e593]: "15"
        - text: Record 15. “Exact dialogue” A longer canonical message.
        - generic [ref=e594]: Â· speech
      - article [ref=e596]:
        - button "Focus 16" [ref=e597]: "16"
        - text: Record 16. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e598]: Â· speech
      - article [ref=e600]:
        - button "Focus 17" [ref=e601]: "17"
        - text: Record 17. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e602]: Â· speech
      - article [ref=e604]:
        - button "Focus 18" [ref=e605]: "18"
        - text: Record 18. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e606]: Â· speech
      - article [ref=e608]:
        - button "Focus 19" [ref=e609]: "19"
        - text: Record 19. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e610]: Â· speech
      - article [ref=e612]:
        - button "Focus 20" [ref=e613]: "20"
        - text: Record 20. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e614]: Â· speech
      - article [ref=e616]:
        - button "Focus 21" [ref=e617]: "21"
        - text: Record 21. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e618]: Â· speech
      - article [ref=e620]:
        - button "Focus 22" [ref=e621]: "22"
        - text: Record 22. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e622]: Â· speech
      - article [ref=e624]:
        - button "Focus 23" [ref=e625]: "23"
        - text: Record 23. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e626]: Â· speech
      - article [ref=e628]:
        - button "Focus 24" [ref=e629]: "24"
        - text: Record 24. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e630]: Â· speech
      - article [ref=e632]:
        - button "Focus 25" [ref=e633]: "25"
        - text: Record 25. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e634]: Â· speech
      - article [ref=e636]:
        - button "Focus 26" [ref=e637]: "26"
        - text: Record 26. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e638]: Â· speech
      - article [ref=e640]:
        - button "Focus 27" [ref=e641]: "27"
        - text: Record 27. “Exact dialogue”
        - generic [ref=e642]: Â· speech
      - article [ref=e644]:
        - button "Focus 28" [ref=e645]: "28"
        - text: Record 28. “Exact dialogue” A longer canonical message.
        - generic [ref=e646]: Â· speech
      - article [ref=e648]:
        - button "Focus 29" [ref=e649]: "29"
        - text: Record 29. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e650]: Â· speech
      - article [ref=e652]:
        - button "Focus 30" [ref=e653]: "30"
        - text: Record 30. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e654]: Â· speech
      - article [ref=e656]:
        - button "Focus 31" [ref=e657]: "31"
        - text: Record 31. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e658]: Â· speech
      - article [ref=e660]:
        - button "Focus 32" [ref=e661]: "32"
        - text: Record 32. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e662]: Â· speech
      - article [ref=e664]:
        - button "Focus 33" [ref=e665]: "33"
        - text: Record 33. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e666]: Â· speech
      - article [ref=e668]:
        - button "Focus 34" [ref=e669]: "34"
        - text: Record 34. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e670]: Â· speech
      - article [ref=e672]:
        - button "Focus 35" [ref=e673]: "35"
        - text: Record 35. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e674]: Â· speech
      - article [ref=e676]:
        - button "Focus 36" [ref=e677]: "36"
        - text: Record 36. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e678]: Â· speech
      - article [ref=e680]:
        - button "Focus 37" [ref=e681]: "37"
        - text: Record 37. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e682]: Â· speech
      - article [ref=e684]:
        - button "Focus 38" [ref=e685]: "38"
        - text: Record 38. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e686]: Â· speech
      - article [ref=e688]:
        - button "Focus 39" [ref=e689]: "39"
        - text: Record 39. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e690]: Â· speech
      - article [ref=e692]:
        - button "Focus 40" [ref=e693]: "40"
        - text: Record 40. “Exact dialogue”
        - generic [ref=e694]: Â· speech
      - article [ref=e696]:
        - button "Focus 41" [ref=e697]: "41"
        - text: Record 41. “Exact dialogue” A longer canonical message.
        - generic [ref=e698]: Â· speech
      - article [ref=e700]:
        - button "Focus 42" [ref=e701]: "42"
        - text: Record 42. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e702]: Â· speech
      - article [ref=e704]:
        - button "Focus 43" [ref=e705]: "43"
        - text: Record 43. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e706]: Â· speech
      - article [ref=e708]:
        - button "Focus 44" [ref=e709]: "44"
        - text: Record 44. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e710]: Â· speech
      - article [ref=e712]:
        - button "Focus 45" [ref=e713]: "45"
        - text: Record 45. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e714]: Â· speech
      - article [ref=e716]:
        - button "Focus 46" [ref=e717]: "46"
        - text: Record 46. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e718]: Â· speech
      - article [ref=e720]:
        - button "Focus 47" [ref=e721]: "47"
        - text: Record 47. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e722]: Â· speech
      - article [ref=e724]:
        - button "Focus 48" [ref=e725]: "48"
        - text: Record 48. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e726]: Â· speech
      - article [ref=e728]:
        - button "Focus 49" [ref=e729]: "49"
        - text: Record 49. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e730]: Â· speech
      - article [ref=e732]:
        - button "Focus 50" [ref=e733]: "50"
        - text: Record 50. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e734]: Â· speech
      - article [ref=e736]:
        - button "Focus 51" [ref=e737]: "51"
        - text: Record 51. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e738]: Â· speech
      - article [ref=e740]:
        - button "Focus 52" [ref=e741]: "52"
        - text: Record 52. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e742]: Â· speech
      - article [ref=e744]:
        - button "Focus 53" [ref=e745]: "53"
        - text: Record 53. “Exact dialogue”
        - generic [ref=e746]: Â· speech
      - article [ref=e748]:
        - button "Focus 54" [ref=e749]: "54"
        - text: Record 54. “Exact dialogue” A longer canonical message.
        - generic [ref=e750]: Â· speech
      - article [ref=e752]:
        - button "Focus 55" [ref=e753]: "55"
        - text: Record 55. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e754]: Â· speech
      - article [ref=e756]:
        - button "Focus 56" [ref=e757]: "56"
        - text: Record 56. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e758]: Â· speech
      - article [ref=e760]:
        - button "Focus 57" [ref=e761]: "57"
        - text: Record 57. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e762]: Â· speech
      - article [ref=e764]:
        - button "Focus 58" [ref=e765]: "58"
        - text: Record 58. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e766]: Â· speech
      - article [ref=e768]:
        - button "Focus 59" [ref=e769]: "59"
        - text: Record 59. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e770]: Â· speech
      - article [ref=e772]:
        - button "Focus 60" [ref=e773]: "60"
        - text: Record 60. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e774]: Â· speech
      - article [ref=e776]:
        - button "Focus 61" [ref=e777]: "61"
        - text: Record 61. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e778]: Â· speech
      - article [ref=e780]:
        - button "Focus 62" [ref=e781]: "62"
        - text: Record 62. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e782]: Â· speech
      - article [ref=e784]:
        - button "Focus 63" [ref=e785]: "63"
        - text: Record 63. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e786]: Â· speech
      - article [ref=e788]:
        - button "Focus 64" [ref=e789]: "64"
        - text: Record 64. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e790]: Â· speech
      - article [ref=e792]:
        - button "Focus 65" [ref=e793]: "65"
        - text: Record 65. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e794]: Â· speech
      - article [ref=e796]:
        - button "Focus 66" [ref=e797]: "66"
        - text: Record 66. “Exact dialogue”
        - generic [ref=e798]: Â· speech
      - article [ref=e800]:
        - button "Focus 67" [ref=e801]: "67"
        - text: Record 67. “Exact dialogue” A longer canonical message.
        - generic [ref=e802]: Â· speech
      - article [ref=e804]:
        - button "Focus 68" [ref=e805]: "68"
        - text: Record 68. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e806]: Â· speech
      - article [ref=e808]:
        - button "Focus 69" [ref=e809]: "69"
        - text: Record 69. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e810]: Â· speech
      - article [ref=e812]:
        - button "Focus 70" [ref=e813]: "70"
        - text: Record 70. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e814]: Â· speech
      - article [ref=e816]:
        - button "Focus 71" [ref=e817]: "71"
        - text: Record 71. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e818]: Â· speech
      - article [ref=e820]:
        - button "Focus 72" [ref=e821]: "72"
        - text: Record 72. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e822]: Â· speech
      - article [ref=e824]:
        - button "Focus 73" [ref=e825]: "73"
        - text: Record 73. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e826]: Â· speech
      - article [ref=e828]:
        - button "Focus 74" [ref=e829]: "74"
        - text: Record 74. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e830]: Â· speech
      - article [ref=e832]:
        - button "Focus 75" [ref=e833]: "75"
        - text: Record 75. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e834]: Â· speech
      - article [ref=e836]:
        - button "Focus 76" [ref=e837]: "76"
        - text: Record 76. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e838]: Â· speech
      - article [ref=e840]:
        - button "Focus 77" [ref=e841]: "77"
        - text: Record 77. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e842]: Â· speech
      - article [ref=e844]:
        - button "Focus 78" [ref=e845]: "78"
        - text: Record 78. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e846]: Â· speech
      - article [ref=e848]:
        - button "Focus 79" [ref=e849]: "79"
        - text: Record 79. “Exact dialogue”
        - generic [ref=e850]: Â· speech
      - article [ref=e852]:
        - button "Focus 80" [ref=e853]: "80"
        - text: Record 80. “Exact dialogue” A longer canonical message.
        - generic [ref=e854]: Â· speech
      - article [ref=e856]:
        - button "Focus 81" [ref=e857]: "81"
        - text: Record 81. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e858]: Â· speech
      - article [ref=e860]:
        - button "Focus 82" [ref=e861]: "82"
        - text: Record 82. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e862]: Â· speech
      - article [ref=e864]:
        - button "Focus 83" [ref=e865]: "83"
        - text: Record 83. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e866]: Â· speech
      - article [ref=e868]:
        - button "Focus 84" [ref=e869]: "84"
        - text: Record 84. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e870]: Â· speech
      - article [ref=e872]:
        - button "Focus 85" [ref=e873]: "85"
        - text: Record 85. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e874]: Â· speech
      - article [ref=e876]:
        - button "Focus 86" [ref=e877]: "86"
        - text: Record 86. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e878]: Â· speech
      - article [ref=e880]:
        - button "Focus 87" [ref=e881]: "87"
        - text: Record 87. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e882]: Â· speech
      - article [ref=e884]:
        - button "Focus 88" [ref=e885]: "88"
        - text: Record 88. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e886]: Â· speech
      - article [ref=e888]:
        - button "Focus 89" [ref=e889]: "89"
        - text: Record 89. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e890]: Â· speech
      - article [ref=e892]:
        - button "Focus 90" [ref=e893]: "90"
        - text: Record 90. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e894]: Â· speech
      - article [ref=e896]:
        - button "Focus 91" [ref=e897]: "91"
        - text: Record 91. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e898]: Â· speech
      - article [ref=e900]:
        - button "Focus 92" [ref=e901]: "92"
        - text: Record 92. “Exact dialogue”
        - generic [ref=e902]: Â· speech
      - article [ref=e904]:
        - button "Focus 93" [ref=e905]: "93"
        - text: Record 93. “Exact dialogue” A longer canonical message.
        - generic [ref=e906]: Â· speech
      - article [ref=e908]:
        - button "Focus 94" [ref=e909]: "94"
        - text: Record 94. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e910]: Â· speech
      - article [ref=e912]:
        - button "Focus 95" [ref=e913]: "95"
        - text: Record 95. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e914]: Â· speech
      - article [ref=e916]:
        - button "Focus 96" [ref=e917]: "96"
        - text: Record 96. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e918]: Â· speech
      - article [ref=e920]:
        - button "Focus 97" [ref=e921]: "97"
        - text: Record 97. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e922]: Â· speech
      - article [ref=e924]:
        - button "Focus 98" [ref=e925]: "98"
        - text: Record 98. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e926]: Â· speech
      - article [ref=e928]:
        - button "Focus 99" [ref=e929]: "99"
        - text: Record 99. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e930]: Â· speech
      - article [ref=e932]:
        - button "Focus 100" [ref=e933]: "100"
        - text: Record 100. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e934]: Â· speech
      - article [ref=e936]:
        - button "Focus 101" [ref=e937]: "101"
        - text: Record 101. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e938]: Â· speech
      - article [ref=e940]:
        - button "Focus 102" [ref=e941]: "102"
        - text: Record 102. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e942]: Â· speech
      - article [ref=e944]:
        - button "Focus 103" [ref=e945]: "103"
        - text: Record 103. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e946]: Â· speech
      - article [ref=e948]:
        - button "Focus 104" [ref=e949]: "104"
        - text: Record 104. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e950]: Â· speech
      - article [ref=e952]:
        - button "Focus 105" [ref=e953]: "105"
        - text: Record 105. “Exact dialogue”
        - generic [ref=e954]: Â· speech
      - article [ref=e956]:
        - button "Focus 106" [ref=e957]: "106"
        - text: Record 106. “Exact dialogue” A longer canonical message.
        - generic [ref=e958]: Â· speech
      - article [ref=e960]:
        - button "Focus 107" [ref=e961]: "107"
        - text: Record 107. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e962]: Â· speech
      - article [ref=e964]:
        - button "Focus 108" [ref=e965]: "108"
        - text: Record 108. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e966]: Â· speech
      - article [ref=e968]:
        - button "Focus 109" [ref=e969]: "109"
        - text: Record 109. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e970]: Â· speech
      - article [ref=e972]:
        - button "Focus 110" [ref=e973]: "110"
        - text: Record 110. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e974]: Â· speech
      - article [ref=e976]:
        - button "Focus 111" [ref=e977]: "111"
        - text: Record 111. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e978]: Â· speech
      - article [ref=e980]:
        - button "Focus 112" [ref=e981]: "112"
        - text: Record 112. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e982]: Â· speech
      - article [ref=e984]:
        - button "Focus 113" [ref=e985]: "113"
        - text: Record 113. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e986]: Â· speech
      - article [ref=e988]:
        - button "Focus 114" [ref=e989]: "114"
        - text: Record 114. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e990]: Â· speech
      - article [ref=e992]:
        - button "Focus 115" [ref=e993]: "115"
        - text: Record 115. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e994]: Â· speech
      - article [ref=e996]:
        - button "Focus 116" [ref=e997]: "116"
        - text: Record 116. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e998]: Â· speech
      - article [ref=e1000]:
        - button "Focus 117" [ref=e1001]: "117"
        - text: Record 117. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1002]: Â· speech
      - article [ref=e1004]:
        - button "Focus 118" [ref=e1005]: "118"
        - text: Record 118. “Exact dialogue”
        - generic [ref=e1006]: Â· speech
      - article [ref=e1008]:
        - button "Focus 119" [ref=e1009]: "119"
        - text: Record 119. “Exact dialogue” A longer canonical message.
        - generic [ref=e1010]: Â· speech
      - article [ref=e1012]:
        - button "Focus 120" [ref=e1013]: "120"
        - text: Record 120. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e1014]: Â· speech
      - article [ref=e1016]:
        - button "Focus 121" [ref=e1017]: "121"
        - text: Record 121. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1018]: Â· speech
      - article [ref=e1020]:
        - button "Focus 122" [ref=e1021]: "122"
        - text: Record 122. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1022]: Â· speech
      - article [ref=e1024]:
        - button "Focus 123" [ref=e1025]: "123"
        - text: Record 123. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1026]: Â· speech
      - article [ref=e1028]:
        - button "Focus 124" [ref=e1029]: "124"
        - text: Record 124. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1030]: Â· speech
      - article [ref=e1032]:
        - button "Focus 125" [ref=e1033]: "125"
        - text: Record 125. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1034]: Â· speech
      - article [ref=e1036]:
        - button "Focus 126" [ref=e1037]: "126"
        - text: Record 126. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1038]: Â· speech
      - article [ref=e1040]:
        - button "Focus 127" [ref=e1041]: "127"
        - text: Record 127. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1042]: Â· speech
      - article [ref=e1044]:
        - button "Focus 128" [ref=e1045]: "128"
        - text: Record 128. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1046]: Â· speech
      - status
```

# Test source

```ts
  380 |     (root) => window.scrollY + root.getBoundingClientRect().top + 300,
  381 |   );
  382 |
  383 |   await page.evaluate((y) => window.scrollTo(0, y), target);
  384 |
  385 |   const settled = await page.evaluate(
  386 |     () =>
  387 |       new Promise<number>((resolve) =>
  388 |         requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY))),
  389 |       ),
  390 |   );
  391 |
  392 |   expect(Math.abs(settled - target)).toBeLessThanOrEqual(1);
  393 |   await timeline(page, 'secondary').focus();
  394 |   const beforeKey = await page.evaluate(() => window.scrollY);
  395 |   await page.keyboard.press('PageDown');
  396 |   await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeKey);
  397 |
  398 |   for (let index = 0; index < 3; index++) {
  399 |     const before = Number(await timeline(page, 'secondary').getAttribute('data-story-delivered'));
  400 |     await timeline(page, 'secondary').evaluate((root) =>
  401 |       window.scrollTo(0, window.scrollY + root.getBoundingClientRect().bottom - window.innerHeight + 80),
  402 |     );
  403 |     await expect
  404 |       .poll(async () => Number(await timeline(page, 'secondary').getAttribute('data-story-delivered')))
  405 |       .toBeGreaterThan(before);
  406 |     await ready(page, 'secondary');
  407 |   }
  408 |
  409 |   for (let index = 0; index < 3; index++) {
  410 |     const before = Number(await timeline(page, 'secondary').getAttribute('data-story-after'));
  411 |     await timeline(page, 'secondary').evaluate((root) =>
  412 |       window.scrollTo(0, window.scrollY + root.getBoundingClientRect().top + 80),
  413 |     );
  414 |     await expect
  415 |       .poll(async () => Number(await timeline(page, 'secondary').getAttribute('data-story-after')))
  416 |       .toBeLessThan(before);
  417 |     await ready(page, 'secondary');
  418 |   }
  419 |
  420 |   const secondFocus = timeline(page, 'secondary').locator('[data-story-key]').nth(25).getByRole('button');
  421 |   await secondFocus.focus();
  422 |   const focusedTop = await secondFocus.evaluate((node) => node.getBoundingClientRect().top);
  423 |   control.head = 950;
  424 |   await page.getByRole('button', { name: 'Refresh A', exact: true }).evaluate((button) => {
  425 |     if (!(button instanceof HTMLButtonElement)) throw new Error('Expected fixture refresh button');
  426 |     button.click();
  427 |   });
  428 |
  429 |   await expect(metrics(page, 'secondary')).toContainText('"head":950');
  430 |   await expect(secondFocus).toBeFocused();
  431 |   expect(await secondFocus.evaluate((node) => node.getBoundingClientRect().top)).toBeCloseTo(focusedTop, 0);
  432 |
  433 |   const firstTarget = await timeline(page).evaluate(
  434 |     (root) => window.scrollY + root.getBoundingClientRect().top + 200,
  435 |   );
  436 |
  437 |   await page.evaluate((y) => window.scrollTo(0, y), firstTarget);
  438 |   await timeline(page).focus();
  439 |   await page.keyboard.press('PageDown');
  440 |   await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(firstTarget);
  441 |   const before = Number(await timeline(page).getAttribute('data-story-delivered'));
  442 |   await timeline(page).evaluate((root) =>
  443 |     window.scrollTo(0, window.scrollY + root.getBoundingClientRect().bottom - window.innerHeight + 80),
  444 |   );
  445 |   await expect
  446 |     .poll(async () => Number(await timeline(page).getAttribute('data-story-delivered')))
  447 |     .toBeGreaterThan(before);
  448 |   await ready(page);
  449 |   await expect(timeline(page).locator('[data-story-key]')).toHaveCount(128);
  450 |   await expect(timeline(page, 'secondary').locator('[data-story-key]')).toHaveCount(128);
  451 |   expect(control.requests).toBeLessThan(48);
  452 |   expect(faults).toEqual([]);
  453 | });
  454 |
  455 | for (const direction of ['forward', 'backward'] as const) {
  456 |   for (const rendering of ['short', 'omitted'] as const) {
  457 |     test(`retains the pre-replacement document anchor across ${direction} tall-to-${rendering} windows`, async ({ page }) => {
  458 |       const { control, faults } = await harness(page, 900, true, false, false, false, rendering === 'short' ? '' : direction === 'forward' ? 'tail' : 'head');
  459 |       await ready(page);
  460 |       await page.getByRole('button', { name: 'Toggle second reader', exact: true }).click();
  461 |       await ready(page, 'secondary');
  462 |       await page.addStyleTag({ content: Array.from({ length: 64 }, (_, index) => `[aria-label="primary timeline"] [data-story-cursor="${index + (direction === 'forward' ? 1 : 129)}"]`).join(',') + '{min-height:300px}' });
  463 |
  464 |       if (direction === 'backward') {
  465 |         await timeline(page).evaluate((root) => window.scrollTo(0, window.scrollY + root.getBoundingClientRect().bottom - window.innerHeight + 80));
  466 |         await expect(timeline(page)).toHaveAttribute('data-story-after', '64');
  467 |         await ready(page);
  468 |       }
  469 |
  470 |       await timeline(page).focus();
  471 |       control.hold = true;
  472 |       await timeline(page).evaluate((root, direction) => window.scrollTo(0, window.scrollY + (direction === 'forward' ? root.getBoundingClientRect().bottom - window.innerHeight + 80 : root.getBoundingClientRect().top + 80)), direction);
  473 |       await expect.poll(() => control.pending.length).toBe(1);
  474 |       const before = await documentAnchor(page);
  475 |       control.hold = false;
  476 |
  477 |       for (const deliver of control.pending.splice(0)) await deliver();
  478 |       await expect(timeline(page)).toHaveAttribute('data-story-after', direction === 'forward' ? '64' : '0');
  479 |       await ready(page);
> 480 |       const after = await timeline(page).locator(`[data-story-key="${before.key}"]`).evaluate((row) => ({ offset: row.getBoundingClientRect().top, scrollY: window.scrollY }));
      |                                                                                      ^ Error: locator.evaluate: Test timeout of 20000ms exceeded.
  481 |       await test.info().attach('window-anchor-geometry', { body: JSON.stringify({ direction, rendering, before, after, drift: after.offset - before.offset }), contentType: 'application/json' });
  482 |       expect(Math.abs(after.offset - before.offset)).toBeLessThanOrEqual(1);
  483 |       expect(faults).toEqual([]);
  484 |     });
  485 |   }
  486 | }
  487 |
  488 | async function documentAnchor(page: Page, name = 'primary') {
  489 |   return timeline(page, name).evaluate((root) => {
  490 |     const row = Array.from(root.querySelectorAll<HTMLElement>('[data-story-key]')).find((element) => element.getBoundingClientRect().bottom > 0)!;
  491 |
  492 |     return { key: row.dataset.storyKey!, cursor: Number(row.dataset.storyCursor), offset: row.getBoundingClientRect().top, scrollY: window.scrollY };
  493 |   });
  494 | }
  495 |
  496 | test('uses document scrolling and retains a focused row across automatic prepending', async ({ page }) => {
  497 |   const { faults } = await harness(page, 600, true);
  498 |   await ready(page);
  499 |   await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  500 |   await expect(timeline(page)).toHaveAttribute('data-story-after', '472');
  501 |   await ready(page);
  502 |   const focus = timeline(page).locator('[data-story-key]').nth(2).getByRole('button');
  503 |   const name = await focus.getAttribute('aria-label');
  504 |   await focus.focus();
  505 |   const before = await focus.evaluate((node) => node.getBoundingClientRect().top);
  506 |   await expect
  507 |     .poll(async () => Number(await timeline(page).getAttribute('data-story-after')))
  508 |     .toBeLessThan(472);
  509 |   await ready(page);
  510 |   await expect(page.getByRole('button', { name: name!, exact: true })).toBeFocused();
  511 |   expect(
  512 |     await page
  513 |       .getByRole('button', { name: name!, exact: true })
  514 |       .evaluate((node) => node.getBoundingClientRect().top),
  515 |   ).toBeCloseTo(before, 0);
  516 |   expect(faults).toEqual([]);
  517 | });
  518 |
  519 | test('crosses a long run of omitted row renderings in both directions without a request loop', async ({
  520 |   page,
  521 | }) => {
  522 |   const { control, faults } = await harness(page, 900, false, false, true);
  523 |   await ready(page);
  524 |   await timeline(page).evaluate((root) => {
  525 |     root.scrollTop = root.scrollHeight;
  526 |   });
  527 |   await expect
  528 |     .poll(async () => Number(await timeline(page).getAttribute('data-story-delivered')))
  529 |     .toBeGreaterThanOrEqual(768);
  530 |   await ready(page);
  531 |   await expect(timeline(page).locator('[data-story-cursor="701"]')).toBeAttached();
  532 |   await timeline(page).focus();
  533 |   await timeline(page).evaluate((root) => {
  534 |     root.scrollTop = 0;
  535 |   });
  536 |   await timeline(page).hover();
  537 |   await page.mouse.wheel(0, -200);
  538 |   await expect(timeline(page).locator('[data-story-cursor="99"]')).toBeAttached();
  539 |   await ready(page);
  540 |   expect(control.requests).toBeLessThan(100);
  541 |   expect(faults).toEqual([]);
  542 | });
  543 |
  544 | test('keeps actual command mutation receipts independent of cancelled reading and newer authoritative current', async ({
  545 |   page,
  546 | }) => {
  547 |   const controller = observeSuccession(fixture.initial, board2(fixture.initial).activeSeat, {
  548 |     visibilityEpoch: 'continuous-public',
  549 |     streamHead: 128,
  550 |   });
  551 |
  552 |   controller.matchId = 'match_a';
  553 |   let socket: WebSocketRoute | null = null;
  554 |   let deliver: (() => Promise<void>) | null = null;
  555 |   await page.routeWebSocket('**/api/matches/match_a/events?*', (connection) => {
  556 |     socket = connection;
  557 |     connection.send(JSON.stringify({ type: 'observation', observation: controller }));
  558 |   });
  559 |   const { control, faults } = await harness(page, 128, false, true);
  560 |   await ready(page);
  561 |   expect(control.requests).toBe(4);
  562 |   await page.route('**/api/matches/match_a/actions', (route) => {
  563 |     const request = Schema.decodeUnknownSync(ActionRequest2Schema)(route.request().postDataJSON());
  564 |     deliver = () =>
  565 |       route.fulfill({ json: { accepted: true, actionId: request.actionId, observation: controller } });
  566 |   });
  567 |   await page.getByRole('button', { name: 'Declare income', exact: true }).click();
  568 |   await expect(page.getByLabel('command metrics')).toContainText('"pending":true');
  569 |   await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  570 |   await expect.poll(() => socket !== null && deliver !== null).toBe(true);
  571 |
  572 |   if (!socket || !deliver) throw new Error('Missing held command or current connection');
  573 |   const connection: WebSocketRoute = socket;
  574 |   const receipt: () => Promise<void> = deliver;
  575 |   connection.send(
  576 |     JSON.stringify({
  577 |       type: 'observation',
  578 |       observation: { ...controller, history: { ...controller.history, streamHead: 200 }, decision: null },
  579 |     }),
  580 |   );
```
