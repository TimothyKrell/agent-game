# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: continuous-story.spec.ts >> retains the pre-replacement document anchor across forward tall-to-omitted windows
- Location: e2e/continuous-story.spec.ts:457:5

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1
Received:    10177
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
    - status "primary metrics" [ref=e12]: "{\"after\":64,\"delivered\":192,\"head\":900,\"rows\":128,\"version\":2,\"status\":\"ready\",\"following\":false}"
    - button "Follow primary" [ref=e13]
    - button "Missing anchor primary" [ref=e14]
    - generic "primary timeline" [active] [ref=e16]:
      - article [ref=e18]:
        - button "Focus 65" [ref=e19]: "65"
        - text: Record 65. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e20]: Â· speech
      - article [ref=e22]:
        - button "Focus 66" [ref=e23]: "66"
        - text: Record 66. “Exact dialogue”
        - generic [ref=e24]: Â· speech
      - article [ref=e26]:
        - button "Focus 67" [ref=e27]: "67"
        - text: Record 67. “Exact dialogue” A longer canonical message.
        - generic [ref=e28]: Â· speech
      - article [ref=e30]:
        - button "Focus 68" [ref=e31]: "68"
        - text: Record 68. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e32]: Â· speech
      - article [ref=e34]:
        - button "Focus 69" [ref=e35]: "69"
        - text: Record 69. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e36]: Â· speech
      - article [ref=e38]:
        - button "Focus 70" [ref=e39]: "70"
        - text: Record 70. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e40]: Â· speech
      - article [ref=e42]:
        - button "Focus 71" [ref=e43]: "71"
        - text: Record 71. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e44]: Â· speech
      - article [ref=e46]:
        - button "Focus 72" [ref=e47]: "72"
        - text: Record 72. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e48]: Â· speech
      - article [ref=e50]:
        - button "Focus 73" [ref=e51]: "73"
        - text: Record 73. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e52]: Â· speech
      - article [ref=e54]:
        - button "Focus 74" [ref=e55]: "74"
        - text: Record 74. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e56]: Â· speech
      - article [ref=e58]:
        - button "Focus 75" [ref=e59]: "75"
        - text: Record 75. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e60]: Â· speech
      - article [ref=e62]:
        - button "Focus 76" [ref=e63]: "76"
        - text: Record 76. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e64]: Â· speech
      - article [ref=e66]:
        - button "Focus 77" [ref=e67]: "77"
        - text: Record 77. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e68]: Â· speech
      - article [ref=e70]:
        - button "Focus 78" [ref=e71]: "78"
        - text: Record 78. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e72]: Â· speech
      - article [ref=e74]:
        - button "Focus 79" [ref=e75]: "79"
        - text: Record 79. “Exact dialogue”
        - generic [ref=e76]: Â· speech
      - article [ref=e78]:
        - button "Focus 80" [ref=e79]: "80"
        - text: Record 80. “Exact dialogue” A longer canonical message.
        - generic [ref=e80]: Â· speech
      - article [ref=e82]:
        - button "Focus 81" [ref=e83]: "81"
        - text: Record 81. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e84]: Â· speech
      - article [ref=e86]:
        - button "Focus 82" [ref=e87]: "82"
        - text: Record 82. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e88]: Â· speech
      - article [ref=e90]:
        - button "Focus 83" [ref=e91]: "83"
        - text: Record 83. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e92]: Â· speech
      - article [ref=e94]:
        - button "Focus 84" [ref=e95]: "84"
        - text: Record 84. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e96]: Â· speech
      - article [ref=e98]:
        - button "Focus 85" [ref=e99]: "85"
        - text: Record 85. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e100]: Â· speech
      - article [ref=e102]:
        - button "Focus 86" [ref=e103]: "86"
        - text: Record 86. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e104]: Â· speech
      - article [ref=e106]:
        - button "Focus 87" [ref=e107]: "87"
        - text: Record 87. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e108]: Â· speech
      - article [ref=e110]:
        - button "Focus 88" [ref=e111]: "88"
        - text: Record 88. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e112]: Â· speech
      - article [ref=e114]:
        - button "Focus 89" [ref=e115]: "89"
        - text: Record 89. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e116]: Â· speech
      - article [ref=e118]:
        - button "Focus 90" [ref=e119]: "90"
        - text: Record 90. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e120]: Â· speech
      - article [ref=e122]:
        - button "Focus 91" [ref=e123]: "91"
        - text: Record 91. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e124]: Â· speech
      - article [ref=e126]:
        - button "Focus 92" [ref=e127]: "92"
        - text: Record 92. “Exact dialogue”
        - generic [ref=e128]: Â· speech
      - article [ref=e130]:
        - button "Focus 93" [ref=e131]: "93"
        - text: Record 93. “Exact dialogue” A longer canonical message.
        - generic [ref=e132]: Â· speech
      - article [ref=e134]:
        - button "Focus 94" [ref=e135]: "94"
        - text: Record 94. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e136]: Â· speech
      - article [ref=e138]:
        - button "Focus 95" [ref=e139]: "95"
        - text: Record 95. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e140]: Â· speech
      - article [ref=e142]:
        - button "Focus 96" [ref=e143]: "96"
        - text: Record 96. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e144]: Â· speech
      - article [ref=e146]:
        - button "Focus 97" [ref=e147]: "97"
        - text: Record 97. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e148]: Â· speech
      - article [ref=e150]:
        - button "Focus 98" [ref=e151]: "98"
        - text: Record 98. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e152]: Â· speech
      - article [ref=e154]:
        - button "Focus 99" [ref=e155]: "99"
        - text: Record 99. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e156]: Â· speech
      - article [ref=e158]:
        - button "Focus 100" [ref=e159]: "100"
        - text: Record 100. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e160]: Â· speech
      - article [ref=e162]:
        - button "Focus 101" [ref=e163]: "101"
        - text: Record 101. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e164]: Â· speech
      - article [ref=e166]:
        - button "Focus 102" [ref=e167]: "102"
        - text: Record 102. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e168]: Â· speech
      - article [ref=e170]:
        - button "Focus 103" [ref=e171]: "103"
        - text: Record 103. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e172]: Â· speech
      - article [ref=e174]:
        - button "Focus 104" [ref=e175]: "104"
        - text: Record 104. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e176]: Â· speech
      - article [ref=e178]:
        - button "Focus 105" [ref=e179]: "105"
        - text: Record 105. “Exact dialogue”
        - generic [ref=e180]: Â· speech
      - article [ref=e182]:
        - button "Focus 106" [ref=e183]: "106"
        - text: Record 106. “Exact dialogue” A longer canonical message.
        - generic [ref=e184]: Â· speech
      - article [ref=e186]:
        - button "Focus 107" [ref=e187]: "107"
        - text: Record 107. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e188]: Â· speech
      - article [ref=e190]:
        - button "Focus 108" [ref=e191]: "108"
        - text: Record 108. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e192]: Â· speech
      - article [ref=e194]:
        - button "Focus 109" [ref=e195]: "109"
        - text: Record 109. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e196]: Â· speech
      - article [ref=e198]:
        - button "Focus 110" [ref=e199]: "110"
        - text: Record 110. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e200]: Â· speech
      - article [ref=e202]:
        - button "Focus 111" [ref=e203]: "111"
        - text: Record 111. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e204]: Â· speech
      - article [ref=e206]:
        - button "Focus 112" [ref=e207]: "112"
        - text: Record 112. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e208]: Â· speech
      - article [ref=e210]:
        - button "Focus 113" [ref=e211]: "113"
        - text: Record 113. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e212]: Â· speech
      - article [ref=e214]:
        - button "Focus 114" [ref=e215]: "114"
        - text: Record 114. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e216]: Â· speech
      - article [ref=e218]:
        - button "Focus 115" [ref=e219]: "115"
        - text: Record 115. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e220]: Â· speech
      - article [ref=e222]:
        - button "Focus 116" [ref=e223]: "116"
        - text: Record 116. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e224]: Â· speech
      - article [ref=e226]:
        - button "Focus 117" [ref=e227]: "117"
        - text: Record 117. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e228]: Â· speech
      - article [ref=e230]:
        - button "Focus 118" [ref=e231]: "118"
        - text: Record 118. “Exact dialogue”
        - generic [ref=e232]: Â· speech
      - article [ref=e234]:
        - button "Focus 119" [ref=e235]: "119"
        - text: Record 119. “Exact dialogue” A longer canonical message.
        - generic [ref=e236]: Â· speech
      - article [ref=e238]:
        - button "Focus 120" [ref=e239]: "120"
        - text: Record 120. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e240]: Â· speech
      - article [ref=e242]:
        - button "Focus 121" [ref=e243]: "121"
        - text: Record 121. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e244]: Â· speech
      - article [ref=e246]:
        - button "Focus 122" [ref=e247]: "122"
        - text: Record 122. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e248]: Â· speech
      - article [ref=e250]:
        - button "Focus 123" [ref=e251]: "123"
        - text: Record 123. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e252]: Â· speech
      - article [ref=e254]:
        - button "Focus 124" [ref=e255]: "124"
        - text: Record 124. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e256]: Â· speech
      - article [ref=e258]:
        - button "Focus 125" [ref=e259]: "125"
        - text: Record 125. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e260]: Â· speech
      - article [ref=e262]:
        - button "Focus 126" [ref=e263]: "126"
        - text: Record 126. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e264]: Â· speech
      - article [ref=e266]:
        - button "Focus 127" [ref=e267]: "127"
        - text: Record 127. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e268]: Â· speech
      - article [ref=e270]:
        - button "Focus 128" [ref=e271]: "128"
        - text: Record 128. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e272]: Â· speech
      - status
  - region "secondary" [ref=e273]:
    - status "secondary metrics" [ref=e274]: "{\"after\":0,\"delivered\":128,\"head\":900,\"rows\":128,\"version\":1,\"status\":\"ready\",\"following\":false}"
    - button "Follow secondary" [ref=e275]
    - button "Missing anchor secondary" [ref=e276]
    - generic "secondary timeline" [ref=e278]:
      - article [ref=e280]:
        - button "Focus 1" [ref=e281]: "1"
        - text: Record 1. “Exact dialogue”
        - generic [ref=e282]: Â· speech
      - article [ref=e284]:
        - button "Focus 2" [ref=e285]: "2"
        - text: Record 2. “Exact dialogue” A longer canonical message.
        - generic [ref=e286]: Â· speech
      - article [ref=e288]:
        - button "Focus 3" [ref=e289]: "3"
        - text: Record 3. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e290]: Â· speech
      - article [ref=e292]:
        - button "Focus 4" [ref=e293]: "4"
        - text: Record 4. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e294]: Â· speech
      - article [ref=e296]:
        - button "Focus 5" [ref=e297]: "5"
        - text: Record 5. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e298]: Â· speech
      - article [ref=e300]:
        - button "Focus 6" [ref=e301]: "6"
        - text: Record 6. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e302]: Â· speech
      - article [ref=e304]:
        - button "Focus 7" [ref=e305]: "7"
        - text: Record 7. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e306]: Â· speech
      - article [ref=e308]:
        - button "Focus 8" [ref=e309]: "8"
        - text: Record 8. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e310]: Â· speech
      - article [ref=e312]:
        - button "Focus 9" [ref=e313]: "9"
        - text: Record 9. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e314]: Â· speech
      - article [ref=e316]:
        - button "Focus 10" [ref=e317]: "10"
        - text: Record 10. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e318]: Â· speech
      - article [ref=e320]:
        - button "Focus 11" [ref=e321]: "11"
        - text: Record 11. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e322]: Â· speech
      - article [ref=e324]:
        - button "Focus 12" [ref=e325]: "12"
        - text: Record 12. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e326]: Â· speech
      - article [ref=e328]:
        - button "Focus 13" [ref=e329]: "13"
        - text: Record 13. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e330]: Â· speech
      - article [ref=e332]:
        - button "Focus 14" [ref=e333]: "14"
        - text: Record 14. “Exact dialogue”
        - generic [ref=e334]: Â· speech
      - article [ref=e336]:
        - button "Focus 15" [ref=e337]: "15"
        - text: Record 15. “Exact dialogue” A longer canonical message.
        - generic [ref=e338]: Â· speech
      - article [ref=e340]:
        - button "Focus 16" [ref=e341]: "16"
        - text: Record 16. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e342]: Â· speech
      - article [ref=e344]:
        - button "Focus 17" [ref=e345]: "17"
        - text: Record 17. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e346]: Â· speech
      - article [ref=e348]:
        - button "Focus 18" [ref=e349]: "18"
        - text: Record 18. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e350]: Â· speech
      - article [ref=e352]:
        - button "Focus 19" [ref=e353]: "19"
        - text: Record 19. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e354]: Â· speech
      - article [ref=e356]:
        - button "Focus 20" [ref=e357]: "20"
        - text: Record 20. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e358]: Â· speech
      - article [ref=e360]:
        - button "Focus 21" [ref=e361]: "21"
        - text: Record 21. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e362]: Â· speech
      - article [ref=e364]:
        - button "Focus 22" [ref=e365]: "22"
        - text: Record 22. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e366]: Â· speech
      - article [ref=e368]:
        - button "Focus 23" [ref=e369]: "23"
        - text: Record 23. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e370]: Â· speech
      - article [ref=e372]:
        - button "Focus 24" [ref=e373]: "24"
        - text: Record 24. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e374]: Â· speech
      - article [ref=e376]:
        - button "Focus 25" [ref=e377]: "25"
        - text: Record 25. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e378]: Â· speech
      - article [ref=e380]:
        - button "Focus 26" [ref=e381]: "26"
        - text: Record 26. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e382]: Â· speech
      - article [ref=e384]:
        - button "Focus 27" [ref=e385]: "27"
        - text: Record 27. “Exact dialogue”
        - generic [ref=e386]: Â· speech
      - article [ref=e388]:
        - button "Focus 28" [ref=e389]: "28"
        - text: Record 28. “Exact dialogue” A longer canonical message.
        - generic [ref=e390]: Â· speech
      - article [ref=e392]:
        - button "Focus 29" [ref=e393]: "29"
        - text: Record 29. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e394]: Â· speech
      - article [ref=e396]:
        - button "Focus 30" [ref=e397]: "30"
        - text: Record 30. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e398]: Â· speech
      - article [ref=e400]:
        - button "Focus 31" [ref=e401]: "31"
        - text: Record 31. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e402]: Â· speech
      - article [ref=e404]:
        - button "Focus 32" [ref=e405]: "32"
        - text: Record 32. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e406]: Â· speech
      - article [ref=e408]:
        - button "Focus 33" [ref=e409]: "33"
        - text: Record 33. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e410]: Â· speech
      - article [ref=e412]:
        - button "Focus 34" [ref=e413]: "34"
        - text: Record 34. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e414]: Â· speech
      - article [ref=e416]:
        - button "Focus 35" [ref=e417]: "35"
        - text: Record 35. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e418]: Â· speech
      - article [ref=e420]:
        - button "Focus 36" [ref=e421]: "36"
        - text: Record 36. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e422]: Â· speech
      - article [ref=e424]:
        - button "Focus 37" [ref=e425]: "37"
        - text: Record 37. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e426]: Â· speech
      - article [ref=e428]:
        - button "Focus 38" [ref=e429]: "38"
        - text: Record 38. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e430]: Â· speech
      - article [ref=e432]:
        - button "Focus 39" [ref=e433]: "39"
        - text: Record 39. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e434]: Â· speech
      - article [ref=e436]:
        - button "Focus 40" [ref=e437]: "40"
        - text: Record 40. “Exact dialogue”
        - generic [ref=e438]: Â· speech
      - article [ref=e440]:
        - button "Focus 41" [ref=e441]: "41"
        - text: Record 41. “Exact dialogue” A longer canonical message.
        - generic [ref=e442]: Â· speech
      - article [ref=e444]:
        - button "Focus 42" [ref=e445]: "42"
        - text: Record 42. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e446]: Â· speech
      - article [ref=e448]:
        - button "Focus 43" [ref=e449]: "43"
        - text: Record 43. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e450]: Â· speech
      - article [ref=e452]:
        - button "Focus 44" [ref=e453]: "44"
        - text: Record 44. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e454]: Â· speech
      - article [ref=e456]:
        - button "Focus 45" [ref=e457]: "45"
        - text: Record 45. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e458]: Â· speech
      - article [ref=e460]:
        - button "Focus 46" [ref=e461]: "46"
        - text: Record 46. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e462]: Â· speech
      - article [ref=e464]:
        - button "Focus 47" [ref=e465]: "47"
        - text: Record 47. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e466]: Â· speech
      - article [ref=e468]:
        - button "Focus 48" [ref=e469]: "48"
        - text: Record 48. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e470]: Â· speech
      - article [ref=e472]:
        - button "Focus 49" [ref=e473]: "49"
        - text: Record 49. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e474]: Â· speech
      - article [ref=e476]:
        - button "Focus 50" [ref=e477]: "50"
        - text: Record 50. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e478]: Â· speech
      - article [ref=e480]:
        - button "Focus 51" [ref=e481]: "51"
        - text: Record 51. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e482]: Â· speech
      - article [ref=e484]:
        - button "Focus 52" [ref=e485]: "52"
        - text: Record 52. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e486]: Â· speech
      - article [ref=e488]:
        - button "Focus 53" [ref=e489]: "53"
        - text: Record 53. “Exact dialogue”
        - generic [ref=e490]: Â· speech
      - article [ref=e492]:
        - button "Focus 54" [ref=e493]: "54"
        - text: Record 54. “Exact dialogue” A longer canonical message.
        - generic [ref=e494]: Â· speech
      - article [ref=e496]:
        - button "Focus 55" [ref=e497]: "55"
        - text: Record 55. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e498]: Â· speech
      - article [ref=e500]:
        - button "Focus 56" [ref=e501]: "56"
        - text: Record 56. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e502]: Â· speech
      - article [ref=e504]:
        - button "Focus 57" [ref=e505]: "57"
        - text: Record 57. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e506]: Â· speech
      - article [ref=e508]:
        - button "Focus 58" [ref=e509]: "58"
        - text: Record 58. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e510]: Â· speech
      - article [ref=e512]:
        - button "Focus 59" [ref=e513]: "59"
        - text: Record 59. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e514]: Â· speech
      - article [ref=e516]:
        - button "Focus 60" [ref=e517]: "60"
        - text: Record 60. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e518]: Â· speech
      - article [ref=e520]:
        - button "Focus 61" [ref=e521]: "61"
        - text: Record 61. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e522]: Â· speech
      - article [ref=e524]:
        - button "Focus 62" [ref=e525]: "62"
        - text: Record 62. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e526]: Â· speech
      - article [ref=e528]:
        - button "Focus 63" [ref=e529]: "63"
        - text: Record 63. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e530]: Â· speech
      - article [ref=e532]:
        - button "Focus 64" [ref=e533]: "64"
        - text: Record 64. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e534]: Â· speech
      - article [ref=e536]:
        - button "Focus 65" [ref=e537]: "65"
        - text: Record 65. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e538]: Â· speech
      - article [ref=e540]:
        - button "Focus 66" [ref=e541]: "66"
        - text: Record 66. “Exact dialogue”
        - generic [ref=e542]: Â· speech
      - article [ref=e544]:
        - button "Focus 67" [ref=e545]: "67"
        - text: Record 67. “Exact dialogue” A longer canonical message.
        - generic [ref=e546]: Â· speech
      - article [ref=e548]:
        - button "Focus 68" [ref=e549]: "68"
        - text: Record 68. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e550]: Â· speech
      - article [ref=e552]:
        - button "Focus 69" [ref=e553]: "69"
        - text: Record 69. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e554]: Â· speech
      - article [ref=e556]:
        - button "Focus 70" [ref=e557]: "70"
        - text: Record 70. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e558]: Â· speech
      - article [ref=e560]:
        - button "Focus 71" [ref=e561]: "71"
        - text: Record 71. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e562]: Â· speech
      - article [ref=e564]:
        - button "Focus 72" [ref=e565]: "72"
        - text: Record 72. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e566]: Â· speech
      - article [ref=e568]:
        - button "Focus 73" [ref=e569]: "73"
        - text: Record 73. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e570]: Â· speech
      - article [ref=e572]:
        - button "Focus 74" [ref=e573]: "74"
        - text: Record 74. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e574]: Â· speech
      - article [ref=e576]:
        - button "Focus 75" [ref=e577]: "75"
        - text: Record 75. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e578]: Â· speech
      - article [ref=e580]:
        - button "Focus 76" [ref=e581]: "76"
        - text: Record 76. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e582]: Â· speech
      - article [ref=e584]:
        - button "Focus 77" [ref=e585]: "77"
        - text: Record 77. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e586]: Â· speech
      - article [ref=e588]:
        - button "Focus 78" [ref=e589]: "78"
        - text: Record 78. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e590]: Â· speech
      - article [ref=e592]:
        - button "Focus 79" [ref=e593]: "79"
        - text: Record 79. “Exact dialogue”
        - generic [ref=e594]: Â· speech
      - article [ref=e596]:
        - button "Focus 80" [ref=e597]: "80"
        - text: Record 80. “Exact dialogue” A longer canonical message.
        - generic [ref=e598]: Â· speech
      - article [ref=e600]:
        - button "Focus 81" [ref=e601]: "81"
        - text: Record 81. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e602]: Â· speech
      - article [ref=e604]:
        - button "Focus 82" [ref=e605]: "82"
        - text: Record 82. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e606]: Â· speech
      - article [ref=e608]:
        - button "Focus 83" [ref=e609]: "83"
        - text: Record 83. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e610]: Â· speech
      - article [ref=e612]:
        - button "Focus 84" [ref=e613]: "84"
        - text: Record 84. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e614]: Â· speech
      - article [ref=e616]:
        - button "Focus 85" [ref=e617]: "85"
        - text: Record 85. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e618]: Â· speech
      - article [ref=e620]:
        - button "Focus 86" [ref=e621]: "86"
        - text: Record 86. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e622]: Â· speech
      - article [ref=e624]:
        - button "Focus 87" [ref=e625]: "87"
        - text: Record 87. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e626]: Â· speech
      - article [ref=e628]:
        - button "Focus 88" [ref=e629]: "88"
        - text: Record 88. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e630]: Â· speech
      - article [ref=e632]:
        - button "Focus 89" [ref=e633]: "89"
        - text: Record 89. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e634]: Â· speech
      - article [ref=e636]:
        - button "Focus 90" [ref=e637]: "90"
        - text: Record 90. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e638]: Â· speech
      - article [ref=e640]:
        - button "Focus 91" [ref=e641]: "91"
        - text: Record 91. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e642]: Â· speech
      - article [ref=e644]:
        - button "Focus 92" [ref=e645]: "92"
        - text: Record 92. “Exact dialogue”
        - generic [ref=e646]: Â· speech
      - article [ref=e648]:
        - button "Focus 93" [ref=e649]: "93"
        - text: Record 93. “Exact dialogue” A longer canonical message.
        - generic [ref=e650]: Â· speech
      - article [ref=e652]:
        - button "Focus 94" [ref=e653]: "94"
        - text: Record 94. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e654]: Â· speech
      - article [ref=e656]:
        - button "Focus 95" [ref=e657]: "95"
        - text: Record 95. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e658]: Â· speech
      - article [ref=e660]:
        - button "Focus 96" [ref=e661]: "96"
        - text: Record 96. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e662]: Â· speech
      - article [ref=e664]:
        - button "Focus 97" [ref=e665]: "97"
        - text: Record 97. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e666]: Â· speech
      - article [ref=e668]:
        - button "Focus 98" [ref=e669]: "98"
        - text: Record 98. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e670]: Â· speech
      - article [ref=e672]:
        - button "Focus 99" [ref=e673]: "99"
        - text: Record 99. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e674]: Â· speech
      - article [ref=e676]:
        - button "Focus 100" [ref=e677]: "100"
        - text: Record 100. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e678]: Â· speech
      - article [ref=e680]:
        - button "Focus 101" [ref=e681]: "101"
        - text: Record 101. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e682]: Â· speech
      - article [ref=e684]:
        - button "Focus 102" [ref=e685]: "102"
        - text: Record 102. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e686]: Â· speech
      - article [ref=e688]:
        - button "Focus 103" [ref=e689]: "103"
        - text: Record 103. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e690]: Â· speech
      - article [ref=e692]:
        - button "Focus 104" [ref=e693]: "104"
        - text: Record 104. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e694]: Â· speech
      - article [ref=e696]:
        - button "Focus 105" [ref=e697]: "105"
        - text: Record 105. “Exact dialogue”
        - generic [ref=e698]: Â· speech
      - article [ref=e700]:
        - button "Focus 106" [ref=e701]: "106"
        - text: Record 106. “Exact dialogue” A longer canonical message.
        - generic [ref=e702]: Â· speech
      - article [ref=e704]:
        - button "Focus 107" [ref=e705]: "107"
        - text: Record 107. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e706]: Â· speech
      - article [ref=e708]:
        - button "Focus 108" [ref=e709]: "108"
        - text: Record 108. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e710]: Â· speech
      - article [ref=e712]:
        - button "Focus 109" [ref=e713]: "109"
        - text: Record 109. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e714]: Â· speech
      - article [ref=e716]:
        - button "Focus 110" [ref=e717]: "110"
        - text: Record 110. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e718]: Â· speech
      - article [ref=e720]:
        - button "Focus 111" [ref=e721]: "111"
        - text: Record 111. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e722]: Â· speech
      - article [ref=e724]:
        - button "Focus 112" [ref=e725]: "112"
        - text: Record 112. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e726]: Â· speech
      - article [ref=e728]:
        - button "Focus 113" [ref=e729]: "113"
        - text: Record 113. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e730]: Â· speech
      - article [ref=e732]:
        - button "Focus 114" [ref=e733]: "114"
        - text: Record 114. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e734]: Â· speech
      - article [ref=e736]:
        - button "Focus 115" [ref=e737]: "115"
        - text: Record 115. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e738]: Â· speech
      - article [ref=e740]:
        - button "Focus 116" [ref=e741]: "116"
        - text: Record 116. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e742]: Â· speech
      - article [ref=e744]:
        - button "Focus 117" [ref=e745]: "117"
        - text: Record 117. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e746]: Â· speech
      - article [ref=e748]:
        - button "Focus 118" [ref=e749]: "118"
        - text: Record 118. “Exact dialogue”
        - generic [ref=e750]: Â· speech
      - article [ref=e752]:
        - button "Focus 119" [ref=e753]: "119"
        - text: Record 119. “Exact dialogue” A longer canonical message.
        - generic [ref=e754]: Â· speech
      - article [ref=e756]:
        - button "Focus 120" [ref=e757]: "120"
        - text: Record 120. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e758]: Â· speech
      - article [ref=e760]:
        - button "Focus 121" [ref=e761]: "121"
        - text: Record 121. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e762]: Â· speech
      - article [ref=e764]:
        - button "Focus 122" [ref=e765]: "122"
        - text: Record 122. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e766]: Â· speech
      - article [ref=e768]:
        - button "Focus 123" [ref=e769]: "123"
        - text: Record 123. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e770]: Â· speech
      - article [ref=e772]:
        - button "Focus 124" [ref=e773]: "124"
        - text: Record 124. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e774]: Â· speech
      - article [ref=e776]:
        - button "Focus 125" [ref=e777]: "125"
        - text: Record 125. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e778]: Â· speech
      - article [ref=e780]:
        - button "Focus 126" [ref=e781]: "126"
        - text: Record 126. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e782]: Â· speech
      - article [ref=e784]:
        - button "Focus 127" [ref=e785]: "127"
        - text: Record 127. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e786]: Â· speech
      - article [ref=e788]:
        - button "Focus 128" [ref=e789]: "128"
        - text: Record 128. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e790]: Â· speech
      - status
```

# Test source

```ts
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
  480 |       const after = await timeline(page).locator(`[data-story-key="${before.key}"]`).evaluate((row) => ({ offset: row.getBoundingClientRect().top, scrollY: window.scrollY }));
  481 |       await test.info().attach('window-anchor-geometry', { body: JSON.stringify({ direction, rendering, before, after, drift: after.offset - before.offset }), contentType: 'application/json' });
> 482 |       expect(Math.abs(after.offset - before.offset)).toBeLessThanOrEqual(1);
      |                                                      ^ Error: expect(received).toBeLessThanOrEqual(expected)
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
  581 |   await expect(page.getByLabel('command metrics')).toContainText('"head":200');
  582 |   await receipt();
```
