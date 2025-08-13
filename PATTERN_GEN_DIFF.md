# Pattern Generation Difficulty

| Pattern length<br>(one of 16) | Difficulty (GH) | Seconds<br>(Avg CPU @ 1MH/s) | Hours<br>(Avg CPU @ 1MH/s) | Seconds<br>(3060 GPU @ 300MH/s) | Hours<br>(3060 GPU @ 300MH/s) | Seconds<br>(4090 GPU @ 1500MH/s) | Hours<br>(4090 GPU @ 1500MH/s) |
| ----------------------------- | --------------: | ---------------------------: | -------------------------: | ------------------------------: | ----------------------------: | -------------------------------: | -----------------------------: |
| 4                             |            0.00 |                            0 |                       0.00 |                               0 |                          0.00 |                                0 |                           0.00 |
| 5                             |            0.00 |                            1 |                       0.00 |                               0 |                          0.00 |                                0 |                           0.00 |
| 6                             |            0.02 |                           17 |                       0.00 |                               0 |                          0.00 |                                0 |                           0.00 |
| 7                             |            0.27 |                          268 |                       0.07 |                               1 |                          0.00 |                                0 |                           0.00 |
| 8                             |            4.29 |                        4,295 |                       1.19 |                              14 |                          0.00 |                                3 |                           0.00 |
| 9                             |           68.72 |                       68,719 |                      19.09 |                             229 |                          0.06 |                               46 |                           0.01 |
| 10                            |        1,099.51 |                    1,099,512 |                     305.42 |                           3,665 |                          1.02 |                              733 |                           0.20 |
| 11                            |       17,592.19 |                   17,592,186 |                   4,886.72 |                          58,641 |                         16.29 |                           11,728 |                           3.26 |
| 12                            |      281,474.98 |                  281,474,977 |                  78,187.49 |                         938,250 |                        260.62 |                          187,650 |                          52.12 |
| 13                            |    4,503,599.63 |                4,503,599,627 |               1,250,999.90 |                      15,011,999 |                      4,170.00 |                        3,002,400 |                         834.00 |
| 14                            |   72,057,594.04 |               72,057,594,038 |              20,015,998.34 |                     240,191,980 |                     66,719.99 |                       48,038,396 |                      13,344.00 |
| Lowest on ethereum            |  629,900,910.00 |              629,900,910,000 |             174,972,475.00 |                   2,099,669,700 |                    583,241.58 |                      419,933,940 |                     116,648.32 |

## Notes

- Note that after creating optimized version on CPU CPU can reach few times higher hashrate ([cuda-x-crunch](https://github.com/golem-vanity-market/cuda-x-crunch))
- On GPU we are 10-20% from possible limit, not a lot to optimize
- Note: contract address generation is 20-30% faster than private key generation

## Links

- **Lowest contract on ethereum and lowest proven ever that I have seen:** [https://etherscan.io/address/0x000000000000001d48ffbd0c0da7c129137a9c55](https://etherscan.io/address/0x000000000000001d48ffbd0c0da7c129137a9c55)
