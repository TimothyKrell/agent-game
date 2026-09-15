# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: continuous-story.spec.ts >> retains the pre-replacement document anchor across forward tall-to-short windows
- Location: e2e/continuous-story.spec.ts:457:5

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1
Received:    28.390625
```

# Page snapshot

```yaml
- main [ref=e3]:
  - status "cache entries" [ref=e4]: "0"
  - button "Refresh A" [ref=e5]
  - button "Match B" [ref=e6]
  - button "Toggle chapter" [ref=e7]
  - button "Toggle second reader" [active] [ref=e8]
  - button "Go offline" [ref=e9]
  - button "Go online" [ref=e10]
  - region "primary" [ref=e11]:
    - status "primary metrics" [ref=e12]: "{\"after\":0,\"delivered\":128,\"head\":906,\"rows\":128,\"version\":1,\"status\":\"ready\",\"following\":false}"
    - button "Follow primary" [ref=e13]
    - button "Missing anchor primary" [ref=e14]
    - generic "primary timeline" [ref=e16]:
      - article [ref=e18]:
        - button "Focus 1" [ref=e19]: "1"
        - text: Record 1. “Exact dialogue”
        - generic [ref=e20]: Â· speech
      - article [ref=e22]:
        - button "Focus 2" [ref=e23]: "2"
        - text: Record 2. “Exact dialogue” A longer canonical message.
        - generic [ref=e24]: Â· speech
      - article [ref=e26]:
        - button "Focus 3" [ref=e27]: "3"
        - text: Record 3. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e28]: Â· speech
      - article [ref=e30]:
        - button "Focus 4" [ref=e31]: "4"
        - text: Record 4. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e32]: Â· speech
      - article [ref=e34]:
        - button "Focus 5" [ref=e35]: "5"
        - text: Record 5. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e36]: Â· speech
      - article [ref=e38]:
        - button "Focus 6" [ref=e39]: "6"
        - text: Record 6. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e40]: Â· speech
      - article [ref=e42]:
        - button "Focus 7" [ref=e43]: "7"
        - text: Record 7. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e44]: Â· speech
      - article [ref=e46]:
        - button "Focus 8" [ref=e47]: "8"
        - text: Record 8. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e48]: Â· speech
      - article [ref=e50]:
        - button "Focus 9" [ref=e51]: "9"
        - text: Record 9. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e52]: Â· speech
      - article [ref=e54]:
        - button "Focus 10" [ref=e55]: "10"
        - text: Record 10. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e56]: Â· speech
      - article [ref=e58]:
        - button "Focus 11" [ref=e59]: "11"
        - text: Record 11. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e60]: Â· speech
      - article [ref=e62]:
        - button "Focus 12" [ref=e63]: "12"
        - text: Record 12. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e64]: Â· speech
      - article [ref=e66]:
        - button "Focus 13" [ref=e67]: "13"
        - text: Record 13. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e68]: Â· speech
      - article [ref=e70]:
        - button "Focus 14" [ref=e71]: "14"
        - text: Record 14. “Exact dialogue”
        - generic [ref=e72]: Â· speech
      - article [ref=e74]:
        - button "Focus 15" [ref=e75]: "15"
        - text: Record 15. “Exact dialogue” A longer canonical message.
        - generic [ref=e76]: Â· speech
      - article [ref=e78]:
        - button "Focus 16" [ref=e79]: "16"
        - text: Record 16. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e80]: Â· speech
      - article [ref=e82]:
        - button "Focus 17" [ref=e83]: "17"
        - text: Record 17. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e84]: Â· speech
      - article [ref=e86]:
        - button "Focus 18" [ref=e87]: "18"
        - text: Record 18. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e88]: Â· speech
      - article [ref=e90]:
        - button "Focus 19" [ref=e91]: "19"
        - text: Record 19. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e92]: Â· speech
      - article [ref=e94]:
        - button "Focus 20" [ref=e95]: "20"
        - text: Record 20. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e96]: Â· speech
      - article [ref=e98]:
        - button "Focus 21" [ref=e99]: "21"
        - text: Record 21. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e100]: Â· speech
      - article [ref=e102]:
        - button "Focus 22" [ref=e103]: "22"
        - text: Record 22. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e104]: Â· speech
      - article [ref=e106]:
        - button "Focus 23" [ref=e107]: "23"
        - text: Record 23. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e108]: Â· speech
      - article [ref=e110]:
        - button "Focus 24" [ref=e111]: "24"
        - text: Record 24. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e112]: Â· speech
      - article [ref=e114]:
        - button "Focus 25" [ref=e115]: "25"
        - text: Record 25. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e116]: Â· speech
      - article [ref=e118]:
        - button "Focus 26" [ref=e119]: "26"
        - text: Record 26. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e120]: Â· speech
      - article [ref=e122]:
        - button "Focus 27" [ref=e123]: "27"
        - text: Record 27. “Exact dialogue”
        - generic [ref=e124]: Â· speech
      - article [ref=e126]:
        - button "Focus 28" [ref=e127]: "28"
        - text: Record 28. “Exact dialogue” A longer canonical message.
        - generic [ref=e128]: Â· speech
      - article [ref=e130]:
        - button "Focus 29" [ref=e131]: "29"
        - text: Record 29. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e132]: Â· speech
      - article [ref=e134]:
        - button "Focus 30" [ref=e135]: "30"
        - text: Record 30. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e136]: Â· speech
      - article [ref=e138]:
        - button "Focus 31" [ref=e139]: "31"
        - text: Record 31. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e140]: Â· speech
      - article [ref=e142]:
        - button "Focus 32" [ref=e143]: "32"
        - text: Record 32. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e144]: Â· speech
      - article [ref=e146]:
        - button "Focus 33" [ref=e147]: "33"
        - text: Record 33. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e148]: Â· speech
      - article [ref=e150]:
        - button "Focus 34" [ref=e151]: "34"
        - text: Record 34. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e152]: Â· speech
      - article [ref=e154]:
        - button "Focus 35" [ref=e155]: "35"
        - text: Record 35. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e156]: Â· speech
      - article [ref=e158]:
        - button "Focus 36" [ref=e159]: "36"
        - text: Record 36. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e160]: Â· speech
      - article [ref=e162]:
        - button "Focus 37" [ref=e163]: "37"
        - text: Record 37. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e164]: Â· speech
      - article [ref=e166]:
        - button "Focus 38" [ref=e167]: "38"
        - text: Record 38. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e168]: Â· speech
      - article [ref=e170]:
        - button "Focus 39" [ref=e171]: "39"
        - text: Record 39. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e172]: Â· speech
      - article [ref=e174]:
        - button "Focus 40" [ref=e175]: "40"
        - text: Record 40. “Exact dialogue”
        - generic [ref=e176]: Â· speech
      - article [ref=e178]:
        - button "Focus 41" [ref=e179]: "41"
        - text: Record 41. “Exact dialogue” A longer canonical message.
        - generic [ref=e180]: Â· speech
      - article [ref=e182]:
        - button "Focus 42" [ref=e183]: "42"
        - text: Record 42. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e184]: Â· speech
      - article [ref=e186]:
        - button "Focus 43" [ref=e187]: "43"
        - text: Record 43. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e188]: Â· speech
      - article [ref=e190]:
        - button "Focus 44" [ref=e191]: "44"
        - text: Record 44. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e192]: Â· speech
      - article [ref=e194]:
        - button "Focus 45" [ref=e195]: "45"
        - text: Record 45. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e196]: Â· speech
      - article [ref=e198]:
        - button "Focus 46" [ref=e199]: "46"
        - text: Record 46. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e200]: Â· speech
      - article [ref=e202]:
        - button "Focus 47" [ref=e203]: "47"
        - text: Record 47. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e204]: Â· speech
      - article [ref=e206]:
        - button "Focus 48" [ref=e207]: "48"
        - text: Record 48. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e208]: Â· speech
      - article [ref=e210]:
        - button "Focus 49" [ref=e211]: "49"
        - text: Record 49. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e212]: Â· speech
      - article [ref=e214]:
        - button "Focus 50" [ref=e215]: "50"
        - text: Record 50. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e216]: Â· speech
      - article [ref=e218]:
        - button "Focus 51" [ref=e219]: "51"
        - text: Record 51. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e220]: Â· speech
      - article [ref=e222]:
        - button "Focus 52" [ref=e223]: "52"
        - text: Record 52. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e224]: Â· speech
      - article [ref=e226]:
        - button "Focus 53" [ref=e227]: "53"
        - text: Record 53. “Exact dialogue”
        - generic [ref=e228]: Â· speech
      - article [ref=e230]:
        - button "Focus 54" [ref=e231]: "54"
        - text: Record 54. “Exact dialogue” A longer canonical message.
        - generic [ref=e232]: Â· speech
      - article [ref=e234]:
        - button "Focus 55" [ref=e235]: "55"
        - text: Record 55. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e236]: Â· speech
      - article [ref=e238]:
        - button "Focus 56" [ref=e239]: "56"
        - text: Record 56. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e240]: Â· speech
      - article [ref=e242]:
        - button "Focus 57" [ref=e243]: "57"
        - text: Record 57. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e244]: Â· speech
      - article [ref=e246]:
        - button "Focus 58" [ref=e247]: "58"
        - text: Record 58. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e248]: Â· speech
      - article [ref=e250]:
        - button "Focus 59" [ref=e251]: "59"
        - text: Record 59. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e252]: Â· speech
      - article [ref=e254]:
        - button "Focus 60" [ref=e255]: "60"
        - text: Record 60. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e256]: Â· speech
      - article [ref=e258]:
        - button "Focus 61" [ref=e259]: "61"
        - text: Record 61. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e260]: Â· speech
      - article [ref=e262]:
        - button "Focus 62" [ref=e263]: "62"
        - text: Record 62. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e264]: Â· speech
      - article [ref=e266]:
        - button "Focus 63" [ref=e267]: "63"
        - text: Record 63. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e268]: Â· speech
      - article [ref=e270]:
        - button "Focus 64" [ref=e271]: "64"
        - text: Record 64. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e272]: Â· speech
      - article [ref=e274]:
        - button "Focus 65" [ref=e275]: "65"
        - text: Record 65. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e276]: Â· speech
      - article [ref=e278]:
        - button "Focus 66" [ref=e279]: "66"
        - text: Record 66. “Exact dialogue”
        - generic [ref=e280]: Â· speech
      - article [ref=e282]:
        - button "Focus 67" [ref=e283]: "67"
        - text: Record 67. “Exact dialogue” A longer canonical message.
        - generic [ref=e284]: Â· speech
      - article [ref=e286]:
        - button "Focus 68" [ref=e287]: "68"
        - text: Record 68. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e288]: Â· speech
      - article [ref=e290]:
        - button "Focus 69" [ref=e291]: "69"
        - text: Record 69. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e292]: Â· speech
      - article [ref=e294]:
        - button "Focus 70" [ref=e295]: "70"
        - text: Record 70. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e296]: Â· speech
      - article [ref=e298]:
        - button "Focus 71" [ref=e299]: "71"
        - text: Record 71. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e300]: Â· speech
      - article [ref=e302]:
        - button "Focus 72" [ref=e303]: "72"
        - text: Record 72. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e304]: Â· speech
      - article [ref=e306]:
        - button "Focus 73" [ref=e307]: "73"
        - text: Record 73. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e308]: Â· speech
      - article [ref=e310]:
        - button "Focus 74" [ref=e311]: "74"
        - text: Record 74. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e312]: Â· speech
      - article [ref=e314]:
        - button "Focus 75" [ref=e315]: "75"
        - text: Record 75. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e316]: Â· speech
      - article [ref=e318]:
        - button "Focus 76" [ref=e319]: "76"
        - text: Record 76. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e320]: Â· speech
      - article [ref=e322]:
        - button "Focus 77" [ref=e323]: "77"
        - text: Record 77. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e324]: Â· speech
      - article [ref=e326]:
        - button "Focus 78" [ref=e327]: "78"
        - text: Record 78. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e328]: Â· speech
      - article [ref=e330]:
        - button "Focus 79" [ref=e331]: "79"
        - text: Record 79. “Exact dialogue”
        - generic [ref=e332]: Â· speech
      - article [ref=e334]:
        - button "Focus 80" [ref=e335]: "80"
        - text: Record 80. “Exact dialogue” A longer canonical message.
        - generic [ref=e336]: Â· speech
      - article [ref=e338]:
        - button "Focus 81" [ref=e339]: "81"
        - text: Record 81. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e340]: Â· speech
      - article [ref=e342]:
        - button "Focus 82" [ref=e343]: "82"
        - text: Record 82. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e344]: Â· speech
      - article [ref=e346]:
        - button "Focus 83" [ref=e347]: "83"
        - text: Record 83. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e348]: Â· speech
      - article [ref=e350]:
        - button "Focus 84" [ref=e351]: "84"
        - text: Record 84. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e352]: Â· speech
      - article [ref=e354]:
        - button "Focus 85" [ref=e355]: "85"
        - text: Record 85. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e356]: Â· speech
      - article [ref=e358]:
        - button "Focus 86" [ref=e359]: "86"
        - text: Record 86. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e360]: Â· speech
      - article [ref=e362]:
        - button "Focus 87" [ref=e363]: "87"
        - text: Record 87. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e364]: Â· speech
      - article [ref=e366]:
        - button "Focus 88" [ref=e367]: "88"
        - text: Record 88. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e368]: Â· speech
      - article [ref=e370]:
        - button "Focus 89" [ref=e371]: "89"
        - text: Record 89. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e372]: Â· speech
      - article [ref=e374]:
        - button "Focus 90" [ref=e375]: "90"
        - text: Record 90. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e376]: Â· speech
      - article [ref=e378]:
        - button "Focus 91" [ref=e379]: "91"
        - text: Record 91. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e380]: Â· speech
      - article [ref=e382]:
        - button "Focus 92" [ref=e383]: "92"
        - text: Record 92. “Exact dialogue”
        - generic [ref=e384]: Â· speech
      - article [ref=e386]:
        - button "Focus 93" [ref=e387]: "93"
        - text: Record 93. “Exact dialogue” A longer canonical message.
        - generic [ref=e388]: Â· speech
      - article [ref=e390]:
        - button "Focus 94" [ref=e391]: "94"
        - text: Record 94. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e392]: Â· speech
      - article [ref=e394]:
        - button "Focus 95" [ref=e395]: "95"
        - text: Record 95. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e396]: Â· speech
      - article [ref=e398]:
        - button "Focus 96" [ref=e399]: "96"
        - text: Record 96. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e400]: Â· speech
      - article [ref=e402]:
        - button "Focus 97" [ref=e403]: "97"
        - text: Record 97. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e404]: Â· speech
      - article [ref=e406]:
        - button "Focus 98" [ref=e407]: "98"
        - text: Record 98. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e408]: Â· speech
      - article [ref=e410]:
        - button "Focus 99" [ref=e411]: "99"
        - text: Record 99. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e412]: Â· speech
      - article [ref=e414]:
        - button "Focus 100" [ref=e415]: "100"
        - text: Record 100. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e416]: Â· speech
      - article [ref=e418]:
        - button "Focus 101" [ref=e419]: "101"
        - text: Record 101. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e420]: Â· speech
      - article [ref=e422]:
        - button "Focus 102" [ref=e423]: "102"
        - text: Record 102. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e424]: Â· speech
      - article [ref=e426]:
        - button "Focus 103" [ref=e427]: "103"
        - text: Record 103. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e428]: Â· speech
      - article [ref=e430]:
        - button "Focus 104" [ref=e431]: "104"
        - text: Record 104. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e432]: Â· speech
      - article [ref=e434]:
        - button "Focus 105" [ref=e435]: "105"
        - text: Record 105. “Exact dialogue”
        - generic [ref=e436]: Â· speech
      - article [ref=e438]:
        - button "Focus 106" [ref=e439]: "106"
        - text: Record 106. “Exact dialogue” A longer canonical message.
        - generic [ref=e440]: Â· speech
      - article [ref=e442]:
        - button "Focus 107" [ref=e443]: "107"
        - text: Record 107. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e444]: Â· speech
      - article [ref=e446]:
        - button "Focus 108" [ref=e447]: "108"
        - text: Record 108. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e448]: Â· speech
      - article [ref=e450]:
        - button "Focus 109" [ref=e451]: "109"
        - text: Record 109. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e452]: Â· speech
      - article [ref=e454]:
        - button "Focus 110" [ref=e455]: "110"
        - text: Record 110. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e456]: Â· speech
      - article [ref=e458]:
        - button "Focus 111" [ref=e459]: "111"
        - text: Record 111. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e460]: Â· speech
      - article [ref=e462]:
        - button "Focus 112" [ref=e463]: "112"
        - text: Record 112. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e464]: Â· speech
      - article [ref=e466]:
        - button "Focus 113" [ref=e467]: "113"
        - text: Record 113. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e468]: Â· speech
      - article [ref=e470]:
        - button "Focus 114" [ref=e471]: "114"
        - text: Record 114. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e472]: Â· speech
      - article [ref=e474]:
        - button "Focus 115" [ref=e475]: "115"
        - text: Record 115. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e476]: Â· speech
      - article [ref=e478]:
        - button "Focus 116" [ref=e479]: "116"
        - text: Record 116. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e480]: Â· speech
      - article [ref=e482]:
        - button "Focus 117" [ref=e483]: "117"
        - text: Record 117. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e484]: Â· speech
      - article [ref=e486]:
        - button "Focus 118" [ref=e487]: "118"
        - text: Record 118. “Exact dialogue”
        - generic [ref=e488]: Â· speech
      - article [ref=e490]:
        - button "Focus 119" [ref=e491]: "119"
        - text: Record 119. “Exact dialogue” A longer canonical message.
        - generic [ref=e492]: Â· speech
      - article [ref=e494]:
        - button "Focus 120" [ref=e495]: "120"
        - text: Record 120. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e496]: Â· speech
      - article [ref=e498]:
        - button "Focus 121" [ref=e499]: "121"
        - text: Record 121. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e500]: Â· speech
      - article [ref=e502]:
        - button "Focus 122" [ref=e503]: "122"
        - text: Record 122. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e504]: Â· speech
      - article [ref=e506]:
        - button "Focus 123" [ref=e507]: "123"
        - text: Record 123. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e508]: Â· speech
      - article [ref=e510]:
        - button "Focus 124" [ref=e511]: "124"
        - text: Record 124. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e512]: Â· speech
      - article [ref=e514]:
        - button "Focus 125" [ref=e515]: "125"
        - text: Record 125. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e516]: Â· speech
      - article [ref=e518]:
        - button "Focus 126" [ref=e519]: "126"
        - text: Record 126. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e520]: Â· speech
      - article [ref=e522]:
        - button "Focus 127" [ref=e523]: "127"
        - text: Record 127. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e524]: Â· speech
      - article [ref=e526]:
        - button "Focus 128" [ref=e527]: "128"
        - text: Record 128. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e528]: Â· speech
      - status
      - button "6 new records Â· Read latest" [ref=e529]
  - region "secondary" [ref=e530]:
    - status "secondary metrics" [ref=e531]: "{\"after\":0,\"delivered\":128,\"head\":906,\"rows\":128,\"version\":1,\"status\":\"ready\",\"following\":false}"
    - button "Follow secondary" [ref=e532]
    - button "Missing anchor secondary" [ref=e533]
    - generic "secondary timeline" [ref=e535]:
      - article [ref=e537]:
        - button "Focus 1" [ref=e538]: "1"
        - text: Record 1. “Exact dialogue”
        - generic [ref=e539]: Â· speech
      - article [ref=e541]:
        - button "Focus 2" [ref=e542]: "2"
        - text: Record 2. “Exact dialogue” A longer canonical message.
        - generic [ref=e543]: Â· speech
      - article [ref=e545]:
        - button "Focus 3" [ref=e546]: "3"
        - text: Record 3. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e547]: Â· speech
      - article [ref=e549]:
        - button "Focus 4" [ref=e550]: "4"
        - text: Record 4. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e551]: Â· speech
      - article [ref=e553]:
        - button "Focus 5" [ref=e554]: "5"
        - text: Record 5. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e555]: Â· speech
      - article [ref=e557]:
        - button "Focus 6" [ref=e558]: "6"
        - text: Record 6. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e559]: Â· speech
      - article [ref=e561]:
        - button "Focus 7" [ref=e562]: "7"
        - text: Record 7. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e563]: Â· speech
      - article [ref=e565]:
        - button "Focus 8" [ref=e566]: "8"
        - text: Record 8. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e567]: Â· speech
      - article [ref=e569]:
        - button "Focus 9" [ref=e570]: "9"
        - text: Record 9. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e571]: Â· speech
      - article [ref=e573]:
        - button "Focus 10" [ref=e574]: "10"
        - text: Record 10. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e575]: Â· speech
      - article [ref=e577]:
        - button "Focus 11" [ref=e578]: "11"
        - text: Record 11. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e579]: Â· speech
      - article [ref=e581]:
        - button "Focus 12" [ref=e582]: "12"
        - text: Record 12. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e583]: Â· speech
      - article [ref=e585]:
        - button "Focus 13" [ref=e586]: "13"
        - text: Record 13. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e587]: Â· speech
      - article [ref=e589]:
        - button "Focus 14" [ref=e590]: "14"
        - text: Record 14. “Exact dialogue”
        - generic [ref=e591]: Â· speech
      - article [ref=e593]:
        - button "Focus 15" [ref=e594]: "15"
        - text: Record 15. “Exact dialogue” A longer canonical message.
        - generic [ref=e595]: Â· speech
      - article [ref=e597]:
        - button "Focus 16" [ref=e598]: "16"
        - text: Record 16. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e599]: Â· speech
      - article [ref=e601]:
        - button "Focus 17" [ref=e602]: "17"
        - text: Record 17. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e603]: Â· speech
      - article [ref=e605]:
        - button "Focus 18" [ref=e606]: "18"
        - text: Record 18. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e607]: Â· speech
      - article [ref=e609]:
        - button "Focus 19" [ref=e610]: "19"
        - text: Record 19. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e611]: Â· speech
      - article [ref=e613]:
        - button "Focus 20" [ref=e614]: "20"
        - text: Record 20. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e615]: Â· speech
      - article [ref=e617]:
        - button "Focus 21" [ref=e618]: "21"
        - text: Record 21. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e619]: Â· speech
      - article [ref=e621]:
        - button "Focus 22" [ref=e622]: "22"
        - text: Record 22. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e623]: Â· speech
      - article [ref=e625]:
        - button "Focus 23" [ref=e626]: "23"
        - text: Record 23. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e627]: Â· speech
      - article [ref=e629]:
        - button "Focus 24" [ref=e630]: "24"
        - text: Record 24. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e631]: Â· speech
      - article [ref=e633]:
        - button "Focus 25" [ref=e634]: "25"
        - text: Record 25. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e635]: Â· speech
      - article [ref=e637]:
        - button "Focus 26" [ref=e638]: "26"
        - text: Record 26. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e639]: Â· speech
      - article [ref=e641]:
        - button "Focus 27" [ref=e642]: "27"
        - text: Record 27. “Exact dialogue”
        - generic [ref=e643]: Â· speech
      - article [ref=e645]:
        - button "Focus 28" [ref=e646]: "28"
        - text: Record 28. “Exact dialogue” A longer canonical message.
        - generic [ref=e647]: Â· speech
      - article [ref=e649]:
        - button "Focus 29" [ref=e650]: "29"
        - text: Record 29. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e651]: Â· speech
      - article [ref=e653]:
        - button "Focus 30" [ref=e654]: "30"
        - text: Record 30. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e655]: Â· speech
      - article [ref=e657]:
        - button "Focus 31" [ref=e658]: "31"
        - text: Record 31. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e659]: Â· speech
      - article [ref=e661]:
        - button "Focus 32" [ref=e662]: "32"
        - text: Record 32. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e663]: Â· speech
      - article [ref=e665]:
        - button "Focus 33" [ref=e666]: "33"
        - text: Record 33. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e667]: Â· speech
      - article [ref=e669]:
        - button "Focus 34" [ref=e670]: "34"
        - text: Record 34. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e671]: Â· speech
      - article [ref=e673]:
        - button "Focus 35" [ref=e674]: "35"
        - text: Record 35. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e675]: Â· speech
      - article [ref=e677]:
        - button "Focus 36" [ref=e678]: "36"
        - text: Record 36. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e679]: Â· speech
      - article [ref=e681]:
        - button "Focus 37" [ref=e682]: "37"
        - text: Record 37. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e683]: Â· speech
      - article [ref=e685]:
        - button "Focus 38" [ref=e686]: "38"
        - text: Record 38. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e687]: Â· speech
      - article [ref=e689]:
        - button "Focus 39" [ref=e690]: "39"
        - text: Record 39. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e691]: Â· speech
      - article [ref=e693]:
        - button "Focus 40" [ref=e694]: "40"
        - text: Record 40. “Exact dialogue”
        - generic [ref=e695]: Â· speech
      - article [ref=e697]:
        - button "Focus 41" [ref=e698]: "41"
        - text: Record 41. “Exact dialogue” A longer canonical message.
        - generic [ref=e699]: Â· speech
      - article [ref=e701]:
        - button "Focus 42" [ref=e702]: "42"
        - text: Record 42. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e703]: Â· speech
      - article [ref=e705]:
        - button "Focus 43" [ref=e706]: "43"
        - text: Record 43. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e707]: Â· speech
      - article [ref=e709]:
        - button "Focus 44" [ref=e710]: "44"
        - text: Record 44. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e711]: Â· speech
      - article [ref=e713]:
        - button "Focus 45" [ref=e714]: "45"
        - text: Record 45. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e715]: Â· speech
      - article [ref=e717]:
        - button "Focus 46" [ref=e718]: "46"
        - text: Record 46. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e719]: Â· speech
      - article [ref=e721]:
        - button "Focus 47" [ref=e722]: "47"
        - text: Record 47. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e723]: Â· speech
      - article [ref=e725]:
        - button "Focus 48" [ref=e726]: "48"
        - text: Record 48. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e727]: Â· speech
      - article [ref=e729]:
        - button "Focus 49" [ref=e730]: "49"
        - text: Record 49. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e731]: Â· speech
      - article [ref=e733]:
        - button "Focus 50" [ref=e734]: "50"
        - text: Record 50. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e735]: Â· speech
      - article [ref=e737]:
        - button "Focus 51" [ref=e738]: "51"
        - text: Record 51. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e739]: Â· speech
      - article [ref=e741]:
        - button "Focus 52" [ref=e742]: "52"
        - text: Record 52. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e743]: Â· speech
      - article [ref=e745]:
        - button "Focus 53" [ref=e746]: "53"
        - text: Record 53. “Exact dialogue”
        - generic [ref=e747]: Â· speech
      - article [ref=e749]:
        - button "Focus 54" [ref=e750]: "54"
        - text: Record 54. “Exact dialogue” A longer canonical message.
        - generic [ref=e751]: Â· speech
      - article [ref=e753]:
        - button "Focus 55" [ref=e754]: "55"
        - text: Record 55. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e755]: Â· speech
      - article [ref=e757]:
        - button "Focus 56" [ref=e758]: "56"
        - text: Record 56. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e759]: Â· speech
      - article [ref=e761]:
        - button "Focus 57" [ref=e762]: "57"
        - text: Record 57. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e763]: Â· speech
      - article [ref=e765]:
        - button "Focus 58" [ref=e766]: "58"
        - text: Record 58. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e767]: Â· speech
      - article [ref=e769]:
        - button "Focus 59" [ref=e770]: "59"
        - text: Record 59. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e771]: Â· speech
      - article [ref=e773]:
        - button "Focus 60" [ref=e774]: "60"
        - text: Record 60. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e775]: Â· speech
      - article [ref=e777]:
        - button "Focus 61" [ref=e778]: "61"
        - text: Record 61. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e779]: Â· speech
      - article [ref=e781]:
        - button "Focus 62" [ref=e782]: "62"
        - text: Record 62. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e783]: Â· speech
      - article [ref=e785]:
        - button "Focus 63" [ref=e786]: "63"
        - text: Record 63. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e787]: Â· speech
      - article [ref=e789]:
        - button "Focus 64" [ref=e790]: "64"
        - text: Record 64. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e791]: Â· speech
      - article [ref=e793]:
        - button "Focus 65" [ref=e794]: "65"
        - text: Record 65. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e795]: Â· speech
      - article [ref=e797]:
        - button "Focus 66" [ref=e798]: "66"
        - text: Record 66. “Exact dialogue”
        - generic [ref=e799]: Â· speech
      - article [ref=e801]:
        - button "Focus 67" [ref=e802]: "67"
        - text: Record 67. “Exact dialogue” A longer canonical message.
        - generic [ref=e803]: Â· speech
      - article [ref=e805]:
        - button "Focus 68" [ref=e806]: "68"
        - text: Record 68. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e807]: Â· speech
      - article [ref=e809]:
        - button "Focus 69" [ref=e810]: "69"
        - text: Record 69. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e811]: Â· speech
      - article [ref=e813]:
        - button "Focus 70" [ref=e814]: "70"
        - text: Record 70. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e815]: Â· speech
      - article [ref=e817]:
        - button "Focus 71" [ref=e818]: "71"
        - text: Record 71. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e819]: Â· speech
      - article [ref=e821]:
        - button "Focus 72" [ref=e822]: "72"
        - text: Record 72. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e823]: Â· speech
      - article [ref=e825]:
        - button "Focus 73" [ref=e826]: "73"
        - text: Record 73. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e827]: Â· speech
      - article [ref=e829]:
        - button "Focus 74" [ref=e830]: "74"
        - text: Record 74. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e831]: Â· speech
      - article [ref=e833]:
        - button "Focus 75" [ref=e834]: "75"
        - text: Record 75. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e835]: Â· speech
      - article [ref=e837]:
        - button "Focus 76" [ref=e838]: "76"
        - text: Record 76. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e839]: Â· speech
      - article [ref=e841]:
        - button "Focus 77" [ref=e842]: "77"
        - text: Record 77. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e843]: Â· speech
      - article [ref=e845]:
        - button "Focus 78" [ref=e846]: "78"
        - text: Record 78. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e847]: Â· speech
      - article [ref=e849]:
        - button "Focus 79" [ref=e850]: "79"
        - text: Record 79. “Exact dialogue”
        - generic [ref=e851]: Â· speech
      - article [ref=e853]:
        - button "Focus 80" [ref=e854]: "80"
        - text: Record 80. “Exact dialogue” A longer canonical message.
        - generic [ref=e855]: Â· speech
      - article [ref=e857]:
        - button "Focus 81" [ref=e858]: "81"
        - text: Record 81. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e859]: Â· speech
      - article [ref=e861]:
        - button "Focus 82" [ref=e862]: "82"
        - text: Record 82. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e863]: Â· speech
      - article [ref=e865]:
        - button "Focus 83" [ref=e866]: "83"
        - text: Record 83. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e867]: Â· speech
      - article [ref=e869]:
        - button "Focus 84" [ref=e870]: "84"
        - text: Record 84. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e871]: Â· speech
      - article [ref=e873]:
        - button "Focus 85" [ref=e874]: "85"
        - text: Record 85. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e875]: Â· speech
      - article [ref=e877]:
        - button "Focus 86" [ref=e878]: "86"
        - text: Record 86. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e879]: Â· speech
      - article [ref=e881]:
        - button "Focus 87" [ref=e882]: "87"
        - text: Record 87. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e883]: Â· speech
      - article [ref=e885]:
        - button "Focus 88" [ref=e886]: "88"
        - text: Record 88. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e887]: Â· speech
      - article [ref=e889]:
        - button "Focus 89" [ref=e890]: "89"
        - text: Record 89. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e891]: Â· speech
      - article [ref=e893]:
        - button "Focus 90" [ref=e894]: "90"
        - text: Record 90. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e895]: Â· speech
      - article [ref=e897]:
        - button "Focus 91" [ref=e898]: "91"
        - text: Record 91. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e899]: Â· speech
      - article [ref=e901]:
        - button "Focus 92" [ref=e902]: "92"
        - text: Record 92. “Exact dialogue”
        - generic [ref=e903]: Â· speech
      - article [ref=e905]:
        - button "Focus 93" [ref=e906]: "93"
        - text: Record 93. “Exact dialogue” A longer canonical message.
        - generic [ref=e907]: Â· speech
      - article [ref=e909]:
        - button "Focus 94" [ref=e910]: "94"
        - text: Record 94. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e911]: Â· speech
      - article [ref=e913]:
        - button "Focus 95" [ref=e914]: "95"
        - text: Record 95. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e915]: Â· speech
      - article [ref=e917]:
        - button "Focus 96" [ref=e918]: "96"
        - text: Record 96. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e919]: Â· speech
      - article [ref=e921]:
        - button "Focus 97" [ref=e922]: "97"
        - text: Record 97. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e923]: Â· speech
      - article [ref=e925]:
        - button "Focus 98" [ref=e926]: "98"
        - text: Record 98. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e927]: Â· speech
      - article [ref=e929]:
        - button "Focus 99" [ref=e930]: "99"
        - text: Record 99. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e931]: Â· speech
      - article [ref=e933]:
        - button "Focus 100" [ref=e934]: "100"
        - text: Record 100. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e935]: Â· speech
      - article [ref=e937]:
        - button "Focus 101" [ref=e938]: "101"
        - text: Record 101. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e939]: Â· speech
      - article [ref=e941]:
        - button "Focus 102" [ref=e942]: "102"
        - text: Record 102. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e943]: Â· speech
      - article [ref=e945]:
        - button "Focus 103" [ref=e946]: "103"
        - text: Record 103. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e947]: Â· speech
      - article [ref=e949]:
        - button "Focus 104" [ref=e950]: "104"
        - text: Record 104. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e951]: Â· speech
      - article [ref=e953]:
        - button "Focus 105" [ref=e954]: "105"
        - text: Record 105. “Exact dialogue”
        - generic [ref=e955]: Â· speech
      - article [ref=e957]:
        - button "Focus 106" [ref=e958]: "106"
        - text: Record 106. “Exact dialogue” A longer canonical message.
        - generic [ref=e959]: Â· speech
      - article [ref=e961]:
        - button "Focus 107" [ref=e962]: "107"
        - text: Record 107. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e963]: Â· speech
      - article [ref=e965]:
        - button "Focus 108" [ref=e966]: "108"
        - text: Record 108. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e967]: Â· speech
      - article [ref=e969]:
        - button "Focus 109" [ref=e970]: "109"
        - text: Record 109. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e971]: Â· speech
      - article [ref=e973]:
        - button "Focus 110" [ref=e974]: "110"
        - text: Record 110. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e975]: Â· speech
      - article [ref=e977]:
        - button "Focus 111" [ref=e978]: "111"
        - text: Record 111. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e979]: Â· speech
      - article [ref=e981]:
        - button "Focus 112" [ref=e982]: "112"
        - text: Record 112. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e983]: Â· speech
      - article [ref=e985]:
        - button "Focus 113" [ref=e986]: "113"
        - text: Record 113. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e987]: Â· speech
      - article [ref=e989]:
        - button "Focus 114" [ref=e990]: "114"
        - text: Record 114. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e991]: Â· speech
      - article [ref=e993]:
        - button "Focus 115" [ref=e994]: "115"
        - text: Record 115. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e995]: Â· speech
      - article [ref=e997]:
        - button "Focus 116" [ref=e998]: "116"
        - text: Record 116. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e999]: Â· speech
      - article [ref=e1001]:
        - button "Focus 117" [ref=e1002]: "117"
        - text: Record 117. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1003]: Â· speech
      - article [ref=e1005]:
        - button "Focus 118" [ref=e1006]: "118"
        - text: Record 118. “Exact dialogue”
        - generic [ref=e1007]: Â· speech
      - article [ref=e1009]:
        - button "Focus 119" [ref=e1010]: "119"
        - text: Record 119. “Exact dialogue” A longer canonical message.
        - generic [ref=e1011]: Â· speech
      - article [ref=e1013]:
        - button "Focus 120" [ref=e1014]: "120"
        - text: Record 120. “Exact dialogue” A longer canonical message. A longer canonical message.
        - generic [ref=e1015]: Â· speech
      - article [ref=e1017]:
        - button "Focus 121" [ref=e1018]: "121"
        - text: Record 121. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1019]: Â· speech
      - article [ref=e1021]:
        - button "Focus 122" [ref=e1022]: "122"
        - text: Record 122. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1023]: Â· speech
      - article [ref=e1025]:
        - button "Focus 123" [ref=e1026]: "123"
        - text: Record 123. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1027]: Â· speech
      - article [ref=e1029]:
        - button "Focus 124" [ref=e1030]: "124"
        - text: Record 124. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1031]: Â· speech
      - article [ref=e1033]:
        - button "Focus 125" [ref=e1034]: "125"
        - text: Record 125. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1035]: Â· speech
      - article [ref=e1037]:
        - button "Focus 126" [ref=e1038]: "126"
        - text: Record 126. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1039]: Â· speech
      - article [ref=e1041]:
        - button "Focus 127" [ref=e1042]: "127"
        - text: Record 127. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1043]: Â· speech
      - article [ref=e1045]:
        - button "Focus 128" [ref=e1046]: "128"
        - text: Record 128. “Exact dialogue” A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message. A longer canonical message.
        - generic [ref=e1047]: Â· speech
      - status
      - button "6 new records Â· Read latest" [ref=e1048]
```

# Test source

```ts
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
  457 |     test(`retains the pre-replacement document anchor across ${direction} tall-to-${rendering} windows`, async ({
  458 |       page,
  459 |     }) => {
  460 |       const { control, faults } = await harness(
  461 |         page,
  462 |         900,
  463 |         true,
  464 |         false,
  465 |         false,
  466 |         false,
  467 |         rendering === 'short' ? '' : direction === 'forward' ? 'tail' : 'head',
  468 |       );
  469 |       await ready(page);
  470 |       await page.getByRole('button', { name: 'Toggle second reader', exact: true }).click();
  471 |       await ready(page, 'secondary');
  472 |
  473 |       if (direction === 'forward' && rendering === 'short') {
  474 |         // Match the immutable rereview probe's prior chapter navigation and head-only update.
  475 |         const target = await timeline(page, 'secondary').evaluate(
  476 |           (root) => window.scrollY + root.getBoundingClientRect().top + 400,
  477 |         );
  478 |         await page.evaluate((y) => window.scrollTo(0, y), target);
  479 |         control.head = 906;
  480 |         await page.getByRole('button', { name: 'Refresh A', exact: true }).evaluate((button) => {
  481 |           if (!(button instanceof HTMLButtonElement)) throw new Error('Expected fixture refresh button');
  482 |           button.click();
  483 |         });
  484 |         await expect(metrics(page, 'secondary')).toContainText('"head":906');
> 485 |         expect(Math.abs((await page.evaluate(() => window.scrollY)) - target)).toBeLessThanOrEqual(1);
      |                                                                                ^ Error: expect(received).toBeLessThanOrEqual(expected)
  486 |       }
  487 |
  488 |       await page.addStyleTag({
  489 |         content:
  490 |           Array.from(
  491 |             { length: 64 },
  492 |             (_, index) =>
  493 |               `[aria-label="primary timeline"] [data-story-cursor="${index + (direction === 'forward' ? 1 : 129)}"]`,
  494 |           ).join(',') + '{min-height:300px}',
  495 |       });
  496 |       await page.evaluate(() => window.scrollTo(0, 0));
  497 |
  498 |       if (direction === 'backward') {
  499 |         await timeline(page).evaluate((root) =>
  500 |           window.scrollTo(0, window.scrollY + root.getBoundingClientRect().bottom - window.innerHeight + 80),
  501 |         );
  502 |         await expect(timeline(page)).toHaveAttribute('data-story-after', '64');
  503 |         await ready(page);
  504 |       }
  505 |
  506 |       await timeline(page).focus();
  507 |       control.hold = true;
  508 |       await timeline(page).evaluate(
  509 |         (root, direction) =>
  510 |           window.scrollTo(
  511 |             0,
  512 |             window.scrollY +
  513 |               (direction === 'forward'
  514 |                 ? root.getBoundingClientRect().bottom - window.innerHeight + 80
  515 |                 : root.getBoundingClientRect().top + 80),
  516 |           ),
  517 |         direction,
  518 |       );
  519 |       await expect.poll(() => control.pending.length).toBe(1);
  520 |       const focused =
  521 |         rendering === 'omitted' && direction === 'forward'
  522 |           ? timeline(page)
  523 |               .locator(`[data-story-key="${(await documentAnchor(page)).key}"]`)
  524 |               .getByRole('button')
  525 |           : null;
  526 |
  527 |       if (focused) await focused.focus();
  528 |       const before = await documentAnchor(page);
  529 |       control.hold = false;
  530 |
  531 |       for (const deliver of control.pending.splice(0)) await deliver();
  532 |       await expect(timeline(page)).toHaveAttribute('data-story-after', direction === 'forward' ? '64' : '0');
  533 |       await ready(page);
  534 |       if (focused) await expect(focused).toBeFocused();
  535 |       const after = await timeline(page)
  536 |         .locator(`[data-story-key="${before.key}"]`)
  537 |         .evaluate((row) => ({ offset: row.getBoundingClientRect().top, scrollY: window.scrollY }));
  538 |       await test
  539 |         .info()
  540 |         .attach('window-anchor-geometry', {
  541 |           body: JSON.stringify({ direction, rendering, before, after, drift: after.offset - before.offset }),
  542 |           contentType: 'application/json',
  543 |         });
  544 |       expect(Math.abs(after.offset - before.offset)).toBeLessThanOrEqual(1);
  545 |       expect(faults).toEqual([]);
  546 |     });
  547 |   }
  548 | }
  549 |
  550 | async function documentAnchor(page: Page, name = 'primary') {
  551 |   return timeline(page, name).evaluate((root) => {
  552 |     const row = Array.from(root.querySelectorAll<HTMLElement>('[data-story-key]')).find(
  553 |       (element) => element.getBoundingClientRect().bottom > 0,
  554 |     )!;
  555 |
  556 |     return {
  557 |       key: row.dataset.storyKey!,
  558 |       cursor: Number(row.dataset.storyCursor),
  559 |       offset: row.getBoundingClientRect().top,
  560 |       scrollY: window.scrollY,
  561 |     };
  562 |   });
  563 | }
  564 |
  565 | test('fences a held document replacement against actual navigation and focus into the other chapter', async ({
  566 |   page,
  567 | }) => {
  568 |   const { control, faults } = await harness(page, 900, true);
  569 |   await ready(page);
  570 |   await page.getByRole('button', { name: 'Toggle second reader', exact: true }).click();
  571 |   await ready(page, 'secondary');
  572 |   await page.addStyleTag({
  573 |     content:
  574 |       Array.from(
  575 |         { length: 64 },
  576 |         (_, index) => `[aria-label="primary timeline"] [data-story-cursor="${index + 1}"]`,
  577 |       ).join(',') + '{min-height:300px}',
  578 |   });
  579 |   await timeline(page).focus();
  580 |   control.hold = true;
  581 |   await timeline(page).evaluate((root) =>
  582 |     window.scrollTo(0, window.scrollY + root.getBoundingClientRect().bottom - window.innerHeight + 80),
  583 |   );
  584 |   await expect.poll(() => control.pending.length).toBe(1);
  585 |   const old = await documentAnchor(page);
```
