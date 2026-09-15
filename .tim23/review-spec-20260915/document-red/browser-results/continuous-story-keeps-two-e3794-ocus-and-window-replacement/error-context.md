# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: continuous-story.spec.ts >> keeps two open document chapters independently reachable through scrolling, focus and window replacement
- Location: e2e/continuous-story.spec.ts:370:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1
Received:    10646.609375
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
    - status "primary metrics" [ref=e12]: "{\"after\":0,\"delivered\":128,\"head\":900,\"rows\":128,\"version\":1,\"status\":\"ready\",\"following\":false}"
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
  278 |   await expect(timeline(page)).toHaveAttribute('data-story-delivered', '700');
  279 |   await ready(page);
  280 |   await timeline(page).evaluate((root) => {
  281 |     root.scrollTop = 500;
  282 |   });
  283 |   await expect(metrics(page)).toContainText('"following":false');
  284 |   const anchor = await geometry(page);
  285 |   control.head = 760;
  286 |   await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  287 |   await expect(metrics(page)).toContainText('"head":760');
  288 |   expect(await geometry(page)).toEqual(anchor);
  289 |   await expect(timeline(page)).toHaveAttribute('data-story-delivered', '700');
  290 |   await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  291 |   await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  292 |   await ready(page);
  293 |   expect(await geometry(page)).toEqual(anchor);
  294 |   const focus = timeline(page).locator('[data-story-key]').nth(50).getByRole('button');
  295 |   const focusName = await focus.getAttribute('aria-label');
  296 |   await focus.focus();
  297 |   await page.keyboard.press('ArrowDown');
  298 |   await expect(page.getByRole('button', { name: focusName!, exact: true })).toBeFocused();
  299 |   await timeline(page).focus();
  300 |
  301 |   const prependedAnchor = await timeline(page).evaluate((root) => {
  302 |     root.scrollTop = 100;
  303 |     const top = root.getBoundingClientRect().top;
  304 |
  305 |     const row = Array.from(root.querySelectorAll<HTMLElement>('[data-story-key]')).find(
  306 |       (element) => element.getBoundingClientRect().bottom > top + 1,
  307 |     )!;
  308 |
  309 |     return { key: row.dataset.storyKey!, offset: row.getBoundingClientRect().top - top };
  310 |   });
  311 |
  312 |   await expect
  313 |     .poll(async () => Number(await timeline(page).getAttribute('data-story-after')))
  314 |     .toBeLessThan(572);
  315 |   await ready(page);
  316 |   const restoredAnchor = await geometry(page);
  317 |   expect(restoredAnchor.key).toBe(prependedAnchor.key);
  318 |   expect(Math.abs(restoredAnchor.offset - prependedAnchor.offset)).toBeLessThanOrEqual(1);
  319 |   await test.info().attach('prepend-geometry', {
  320 |     body: JSON.stringify({ before: prependedAnchor, after: await geometry(page) }),
  321 |     contentType: 'application/json',
  322 |   });
  323 |   await expect(timeline(page).locator('[data-story-key]')).toHaveCount(128);
  324 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  325 |   expect(faults).toEqual([]);
  326 | });
  327 |
  328 | test('pauses hidden reading, follows successive frozen live heads, and recovers a network retry from an empty record', async ({
  329 |   page,
  330 | }) => {
  331 |   const { control, faults } = await harness(page, 0);
  332 |   await ready(page);
  333 |   expect(control.requests).toBe(0);
  334 |   await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  335 |   control.hold = true;
  336 |   control.head = 200;
  337 |   await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  338 |   await expect.poll(() => control.pending.length).toBe(1);
  339 |   control.head = 300;
  340 |   await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  341 |   await expect(metrics(page)).toContainText('"head":300');
  342 |   await expect(timeline(page)).toHaveAttribute('data-story-delivered', '0');
  343 |   control.hold = false;
  344 |
  345 |   for (const deliver of control.pending.splice(0)) await deliver();
  346 |   await expect(timeline(page)).toHaveAttribute('data-story-delivered', '300');
  347 |   await ready(page);
  348 |   await page.evaluate(() => {
  349 |     Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  350 |     document.dispatchEvent(new Event('visibilitychange'));
  351 |   });
  352 |   const requests = control.requests;
  353 |   control.head = 400;
  354 |   await page.getByRole('button', { name: 'Refresh A', exact: true }).click();
  355 |   await expect(metrics(page)).toContainText('"head":400');
  356 |   expect(control.requests).toBe(requests);
  357 |   control.fail = true;
  358 |   await page.evaluate(() => {
  359 |     Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  360 |     document.dispatchEvent(new Event('visibilitychange'));
  361 |   });
  362 |   await expect(metrics(page)).toContainText('"status":"error"');
  363 |   await expect(timeline(page)).toHaveAttribute('data-story-delivered', '300');
  364 |   control.fail = false;
  365 |   await timeline(page).getByRole('button', { name: 'Retry', exact: true }).click();
  366 |   await expect(timeline(page)).toHaveAttribute('data-story-delivered', '400');
  367 |   expect(faults).toEqual([]);
  368 | });
  369 |
  370 | test('keeps two open document chapters independently reachable through scrolling, focus and window replacement', async ({ page }) => {
  371 |   const { control, faults } = await harness(page, 900, true);
  372 |   await ready(page);
  373 |   await page.getByRole('button', { name: 'Toggle second reader', exact: true }).click();
  374 |   await ready(page, 'secondary');
  375 |   const target = await timeline(page, 'secondary').evaluate((root) => window.scrollY + root.getBoundingClientRect().top + 300);
  376 |   await page.evaluate((y) => window.scrollTo(0, y), target);
  377 |   const settled = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY)))));
> 378 |   expect(Math.abs(settled - target)).toBeLessThanOrEqual(1);
      |                                      ^ Error: expect(received).toBeLessThanOrEqual(expected)
  379 |   await timeline(page, 'secondary').focus();
  380 |   const beforeKey = await page.evaluate(() => window.scrollY);
  381 |   await page.keyboard.press('PageDown');
  382 |   await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeKey);
  383 |   for (let index = 0; index < 3; index++) {
  384 |     const before = Number(await timeline(page, 'secondary').getAttribute('data-story-delivered'));
  385 |     await timeline(page, 'secondary').evaluate((root) => window.scrollTo(0, window.scrollY + root.getBoundingClientRect().bottom - window.innerHeight + 80));
  386 |     await expect.poll(async () => Number(await timeline(page, 'secondary').getAttribute('data-story-delivered'))).toBeGreaterThan(before);
  387 |     await ready(page, 'secondary');
  388 |   }
  389 |   const firstTarget = await timeline(page).evaluate((root) => window.scrollY + root.getBoundingClientRect().top + 200);
  390 |   await page.evaluate((y) => window.scrollTo(0, y), firstTarget);
  391 |   await timeline(page).focus();
  392 |   await page.keyboard.press('PageDown');
  393 |   await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(firstTarget);
  394 |   const before = Number(await timeline(page).getAttribute('data-story-delivered'));
  395 |   await timeline(page).evaluate((root) => window.scrollTo(0, window.scrollY + root.getBoundingClientRect().bottom - window.innerHeight + 80));
  396 |   await expect.poll(async () => Number(await timeline(page).getAttribute('data-story-delivered'))).toBeGreaterThan(before);
  397 |   await ready(page);
  398 |   await expect(timeline(page).locator('[data-story-key]')).toHaveCount(128);
  399 |   await expect(timeline(page, 'secondary').locator('[data-story-key]')).toHaveCount(128);
  400 |   expect(control.requests).toBeLessThan(40);
  401 |   expect(faults).toEqual([]);
  402 | });
  403 |
  404 | test('uses document scrolling and retains a focused row across automatic prepending', async ({ page }) => {
  405 |   const { faults } = await harness(page, 600, true);
  406 |   await ready(page);
  407 |   await page.getByRole('button', { name: 'Follow primary', exact: true }).click();
  408 |   await expect(timeline(page)).toHaveAttribute('data-story-after', '472');
  409 |   await ready(page);
  410 |   const focus = timeline(page).locator('[data-story-key]').nth(2).getByRole('button');
  411 |   const name = await focus.getAttribute('aria-label');
  412 |   await focus.focus();
  413 |   const before = await focus.evaluate((node) => node.getBoundingClientRect().top);
  414 |   await expect
  415 |     .poll(async () => Number(await timeline(page).getAttribute('data-story-after')))
  416 |     .toBeLessThan(472);
  417 |   await ready(page);
  418 |   await expect(page.getByRole('button', { name: name!, exact: true })).toBeFocused();
  419 |   expect(
  420 |     await page
  421 |       .getByRole('button', { name: name!, exact: true })
  422 |       .evaluate((node) => node.getBoundingClientRect().top),
  423 |   ).toBeCloseTo(before, 0);
  424 |   expect(faults).toEqual([]);
  425 | });
  426 |
  427 | test('crosses a long run of omitted row renderings in both directions without a request loop', async ({
  428 |   page,
  429 | }) => {
  430 |   const { control, faults } = await harness(page, 900, false, false, true);
  431 |   await ready(page);
  432 |   await timeline(page).evaluate((root) => {
  433 |     root.scrollTop = root.scrollHeight;
  434 |   });
  435 |   await expect
  436 |     .poll(async () => Number(await timeline(page).getAttribute('data-story-delivered')))
  437 |     .toBeGreaterThanOrEqual(768);
  438 |   await ready(page);
  439 |   await expect(timeline(page).locator('[data-story-cursor="701"]')).toBeAttached();
  440 |   await timeline(page).focus();
  441 |   await timeline(page).evaluate((root) => {
  442 |     root.scrollTop = 0;
  443 |   });
  444 |   await timeline(page).hover();
  445 |   await page.mouse.wheel(0, -200);
  446 |   await expect(timeline(page).locator('[data-story-cursor="99"]')).toBeAttached();
  447 |   await ready(page);
  448 |   expect(control.requests).toBeLessThan(100);
  449 |   expect(faults).toEqual([]);
  450 | });
  451 |
  452 | test('keeps actual command mutation receipts independent of cancelled reading and newer authoritative current', async ({
  453 |   page,
  454 | }) => {
  455 |   const controller = observeSuccession(fixture.initial, board2(fixture.initial).activeSeat, {
  456 |     visibilityEpoch: 'continuous-public',
  457 |     streamHead: 128,
  458 |   });
  459 |
  460 |   controller.matchId = 'match_a';
  461 |   let socket: WebSocketRoute | null = null;
  462 |   let deliver: (() => Promise<void>) | null = null;
  463 |   await page.routeWebSocket('**/api/matches/match_a/events?*', (connection) => {
  464 |     socket = connection;
  465 |     connection.send(JSON.stringify({ type: 'observation', observation: controller }));
  466 |   });
  467 |   const { control, faults } = await harness(page, 128, false, true);
  468 |   await ready(page);
  469 |   expect(control.requests).toBe(4);
  470 |   await page.route('**/api/matches/match_a/actions', (route) => {
  471 |     const request = Schema.decodeUnknownSync(ActionRequest2Schema)(route.request().postDataJSON());
  472 |     deliver = () =>
  473 |       route.fulfill({ json: { accepted: true, actionId: request.actionId, observation: controller } });
  474 |   });
  475 |   await page.getByRole('button', { name: 'Declare income', exact: true }).click();
  476 |   await expect(page.getByLabel('command metrics')).toContainText('"pending":true');
  477 |   await page.getByRole('button', { name: 'Toggle chapter', exact: true }).click();
  478 |   await expect.poll(() => socket !== null && deliver !== null).toBe(true);
```
