namespace Urlaubsplanner.Tests.Infrastructure;

/// <summary>
/// Gekürzter Ausschnitt einer echten Antwort von POST /flights/rates (LiteAPI-Sandbox, Gabelflug STR→LIS / OPO→STR):
/// eine Verbindung mit Umstieg in Hamburg und eine Direktverbindung.
/// </summary>
internal static class LiteApiFlightFixture
{
    public const string Response = """
{
 "data": [
  {
   "journeys": [
    {
     "cheapestOffer": {
      "offerId": "AwJ2MQAAAABq",
      "expiration": "2026-10-11T11:14:45.438Z",
      "pricing": {
       "display": {
        "total": 591.54,
        "currency": "EUR",
        "base": 412,
        "fees": 0,
        "taxes": 179.54,
        "perPassenger": {
         "adult": {
          "base": 206,
          "currency": "EUR",
          "fees": 0,
          "taxes": 89.77,
          "total": 295.77
         },
         "child": {
          "base": 0,
          "currency": "EUR",
          "fees": 0,
          "taxes": 0,
          "total": 0
         },
         "infant": {
          "base": 0,
          "currency": "EUR",
          "fees": 0,
          "taxes": 0,
          "total": 0
         }
        }
       },
       "converted": false
      },
      "baggage": {
       "hasCarryOnBag": true,
       "hasCheckedBag": true,
       "included": [
        {
         "bagType": "cabin",
         "description": "Cabin bag",
         "passengerType": "ALL",
         "pieces": 1,
         "pricing": {
          "display": {
           "amount": 0,
           "currency": "EUR"
          },
          "converted": false
         },
         "unit": "kg",
         "weightKg": 8
        },
        {
         "bagType": "checked",
         "description": "Checked bag",
         "passengerType": "ALL",
         "pieces": 1,
         "pricing": {
          "display": {
           "amount": 0,
           "currency": "EUR"
          },
          "converted": false
         },
         "unit": "kg",
         "weightKg": 23
        }
       ]
      },
      "fare": {
       "family": "Smart",
       "mixedCabin": false,
       "mixedFareFamily": false,
       "seatsRemaining": 9
      },
      "segmentFares": [
       {
        "bookingCode": "E",
        "cabin": "Economy",
        "fareBasisCode": "ENFSAFR",
        "fareFamily": "Smart",
        "seatsRemaining": 9,
        "segmentKey": "6fed4218"
       },
       {
        "bookingCode": "E",
        "cabin": "Economy",
        "fareBasisCode": "ENFSAFR",
        "fareFamily": "Smart",
        "seatsRemaining": 9,
        "segmentKey": "f6d464bd"
       },
       {
        "bookingCode": "E",
        "cabin": "Economy",
        "fareBasisCode": "ENFSAFR",
        "fareFamily": "Smart",
        "seatsRemaining": 9,
        "segmentKey": "2f51f155"
       }
      ],
      "terms": {
       "changeable": true,
       "refundable": false
      }
     },
     "connections": [
      {
       "arrivalAirportCode": "HAM",
       "arrivalAirportName": "Hamburg Helmut Schmidt Airport",
       "arrivalTime": "2027-05-12T12:10:00",
       "changeAirport": false,
       "departureAirportCode": "HAM",
       "departureAirportName": "Hamburg Helmut Schmidt Airport",
       "departureTime": "2027-05-12T14:35:00",
       "direction": "OUTBOUND",
       "duration": {
        "iso8601": "PT2H25M",
        "minutes": 145
       },
       "overnight": false
      }
     ],
     "offers": [
      {
       "offerId": "AwJ2MQAAAABq",
       "expiration": "2026-10-11T11:14:45.438Z",
       "pricing": {
        "display": {
         "total": 591.54,
         "currency": "EUR",
         "base": 412,
         "fees": 0,
         "taxes": 179.54,
         "perPassenger": {
          "adult": {
           "base": 206,
           "currency": "EUR",
           "fees": 0,
           "taxes": 89.77,
           "total": 295.77
          },
          "child": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          },
          "infant": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          }
         }
        },
        "converted": false
       },
       "baggage": {
        "hasCarryOnBag": true,
        "hasCheckedBag": true,
        "included": [
         {
          "bagType": "cabin",
          "description": "Cabin bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 8
         },
         {
          "bagType": "checked",
          "description": "Checked bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 23
         }
        ]
       },
       "fare": {
        "family": "Smart",
        "mixedCabin": false,
        "mixedFareFamily": false,
        "seatsRemaining": 9
       },
       "segmentFares": [
        {
         "bookingCode": "E",
         "cabin": "Economy",
         "fareBasisCode": "ENFSAFR",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "6fed4218"
        },
        {
         "bookingCode": "E",
         "cabin": "Economy",
         "fareBasisCode": "ENFSAFR",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "f6d464bd"
        },
        {
         "bookingCode": "E",
         "cabin": "Economy",
         "fareBasisCode": "ENFSAFR",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "2f51f155"
        }
       ],
       "terms": {
        "changeable": true,
        "refundable": false
       }
      },
      {
       "offerId": "AwJ2MQAAAABq",
       "expiration": "2026-10-11T11:14:53.602Z",
       "pricing": {
        "display": {
         "total": 751.54,
         "currency": "EUR",
         "base": 572,
         "fees": 0,
         "taxes": 179.54,
         "perPassenger": {
          "adult": {
           "base": 286,
           "currency": "EUR",
           "fees": 0,
           "taxes": 89.77,
           "total": 375.77
          },
          "child": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          },
          "infant": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          }
         }
        },
        "converted": false
       },
       "baggage": {
        "hasCarryOnBag": true,
        "hasCheckedBag": true,
        "included": [
         {
          "bagType": "checked",
          "description": "Checked bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "size": "62LI 158LCM",
          "unit": "kg",
          "weightKg": 23
         },
         {
          "bagType": "cabin",
          "description": "Cabin bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "size": "46LI 118LCM",
          "unit": "kg",
          "weightKg": 8
         }
        ]
       },
       "fare": {
        "family": "Smart",
        "mixedCabin": false,
        "mixedFareFamily": false,
        "seatsRemaining": 9
       },
       "segmentFares": [
        {
         "bookingCode": "X",
         "cabin": "Economy",
         "fareBasisCode": "XNCWGRDE",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "6fed4218"
        },
        {
         "bookingCode": "X",
         "cabin": "Economy",
         "fareBasisCode": "XNCWGRDE",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "f6d464bd"
        },
        {
         "bookingCode": "X",
         "cabin": "Economy",
         "fareBasisCode": "XNCWGRDE",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "2f51f155"
        }
       ],
       "terms": {
        "changeable": true,
        "refundable": false,
        "changeFee": {
         "pricing": {
          "display": {
           "amount": 80,
           "currency": "EUR"
          },
          "converted": false
         },
         "applicability": "beforeDeparture",
         "label": "Change fee"
        },
        "hasChangeFee": true
       }
      },
      {
       "offerId": "AwJ2MQAAAABq",
       "expiration": "2026-10-11T11:14:45.440Z",
       "pricing": {
        "display": {
         "total": 2047.54,
         "currency": "EUR",
         "base": 1868,
         "fees": 0,
         "taxes": 179.54,
         "perPassenger": {
          "adult": {
           "base": 934,
           "currency": "EUR",
           "fees": 0,
           "taxes": 89.77,
           "total": 1023.77
          },
          "child": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          },
          "infant": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          }
         }
        },
        "converted": false
       },
       "baggage": {
        "hasCarryOnBag": true,
        "hasCheckedBag": true,
        "included": [
         {
          "bagType": "cabin",
          "description": "Cabin bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 8
         },
         {
          "bagType": "checked",
          "description": "Checked bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 23
         }
        ]
       },
       "fare": {
        "family": "Smart Flex",
        "mixedCabin": false,
        "mixedFareFamily": false,
        "seatsRemaining": 9
       },
       "segmentFares": [
        {
         "bookingCode": "I",
         "cabin": "Economy",
         "fareBasisCode": "IFLEXWG",
         "fareFamily": "Smart Flex",
         "seatsRemaining": 9,
         "segmentKey": "6fed4218"
        },
        {
         "bookingCode": "I",
         "cabin": "Economy",
         "fareBasisCode": "IFLEXWG",
         "fareFamily": "Smart Flex",
         "seatsRemaining": 9,
         "segmentKey": "f6d464bd"
        },
        {
         "bookingCode": "I",
         "cabin": "Economy",
         "fareBasisCode": "IFLEXWG",
         "fareFamily": "Smart Flex",
         "seatsRemaining": 9,
         "segmentKey": "2f51f155"
        }
       ],
       "terms": {
        "changeable": true,
        "refundable": true
       }
      }
     ],
     "isCheapest": false,
     "journeyKey": "4538324adac6ff90",
     "legDurations": [
      {
       "dayChange": 0,
       "direction": "OUTBOUND",
       "duration": {
        "iso8601": "PT7H5M",
        "minutes": 425
       },
       "overnightFlight": false
      },
      {
       "dayChange": 0,
       "direction": "INBOUND",
       "duration": {
        "iso8601": "PT2H35M",
        "minutes": 155
       },
       "overnightFlight": false
      }
     ],
     "parameters": {
      "adults": 0,
      "children": 0,
      "infants": 0
     },
     "segments": [
      {
       "arrivalTime": "2027-05-12T12:10:00",
       "carrier": {
        "marketingCode": "EW",
        "marketingLogo": "https://assets.nuitee.flights/static/images/airlines/EW.png",
        "marketingName": "Eurowings",
        "operatingCode": "EW",
        "operatingName": "Eurowings"
       },
       "departureTime": "2027-05-12T11:00:00",
       "originCode": "STR",
       "destinationCode": "HAM",
       "direction": "OUTBOUND",
       "duration": {
        "iso8601": "PT1H10M",
        "minutes": 70
       },
       "flight": {
        "marketingNumber": "2042",
        "operatingNumber": "2042"
       },
       "segmentKey": "6fed4218",
       "originName": "Stuttgart Airport",
       "destinationName": "Hamburg Helmut Schmidt Airport",
       "stopCount": 0
      },
      {
       "arrivalTime": "2027-05-12T17:05:00",
       "carrier": {
        "marketingCode": "EW",
        "marketingLogo": "https://assets.nuitee.flights/static/images/airlines/EW.png",
        "marketingName": "Eurowings",
        "operatingCode": "EW",
        "operatingName": "Eurowings"
       },
       "departureTime": "2027-05-12T14:35:00",
       "originCode": "HAM",
       "destinationCode": "LIS",
       "direction": "OUTBOUND",
       "duration": {
        "iso8601": "PT3H30M",
        "minutes": 210
       },
       "flight": {
        "marketingNumber": "7602",
        "operatingNumber": "7602"
       },
       "segmentKey": "f6d464bd",
       "originName": "Hamburg Helmut Schmidt Airport",
       "destinationName": "Lisbon Humberto Delgado Airport",
       "stopCount": 0
      },
      {
       "arrivalTime": "2027-05-19T11:50:00",
       "carrier": {
        "marketingCode": "EW",
        "marketingLogo": "https://assets.nuitee.flights/static/images/airlines/EW.png",
        "marketingName": "Eurowings",
        "operatingCode": "EW",
        "operatingName": "Eurowings"
       },
       "departureTime": "2027-05-19T08:15:00",
       "originCode": "OPO",
       "destinationCode": "STR",
       "direction": "INBOUND",
       "duration": {
        "iso8601": "PT2H35M",
        "minutes": 155
       },
       "flight": {
        "marketingNumber": "2713",
        "operatingNumber": "2713"
       },
       "segmentKey": "2f51f155",
       "originName": "Francisco de Sá Carneiro Airport",
       "destinationName": "Stuttgart Airport",
       "stopCount": 0
      }
     ],
     "timestamp": "2026-10-11T11:04:45.438Z",
     "totalDuration": {
      "iso8601": "PT9H40M",
      "minutes": 580
     }
    },
    {
     "cheapestOffer": {
      "offerId": "AwJ2MQAAAABq",
      "expiration": "2026-10-11T11:14:45.438Z",
      "pricing": {
       "display": {
        "total": 467.04,
        "currency": "EUR",
        "base": 332,
        "fees": 0,
        "taxes": 135.04,
        "perPassenger": {
         "adult": {
          "base": 166,
          "currency": "EUR",
          "fees": 0,
          "taxes": 67.52,
          "total": 233.52
         },
         "child": {
          "base": 0,
          "currency": "EUR",
          "fees": 0,
          "taxes": 0,
          "total": 0
         },
         "infant": {
          "base": 0,
          "currency": "EUR",
          "fees": 0,
          "taxes": 0,
          "total": 0
         }
        }
       },
       "converted": false
      },
      "baggage": {
       "hasCarryOnBag": true,
       "hasCheckedBag": true,
       "included": [
        {
         "bagType": "cabin",
         "description": "Cabin bag",
         "passengerType": "ALL",
         "pieces": 1,
         "pricing": {
          "display": {
           "amount": 0,
           "currency": "EUR"
          },
          "converted": false
         },
         "unit": "kg",
         "weightKg": 8
        },
        {
         "bagType": "checked",
         "description": "Checked bag",
         "passengerType": "ALL",
         "pieces": 1,
         "pricing": {
          "display": {
           "amount": 0,
           "currency": "EUR"
          },
          "converted": false
         },
         "unit": "kg",
         "weightKg": 23
        }
       ]
      },
      "fare": {
       "family": "Smart",
       "mixedCabin": false,
       "mixedFareFamily": false,
       "seatsRemaining": 9
      },
      "segmentFares": [
       {
        "bookingCode": "E",
        "cabin": "Economy",
        "fareBasisCode": "ENCWGRDE",
        "fareFamily": "Smart",
        "seatsRemaining": 9,
        "segmentKey": "5d5d3f55"
       },
       {
        "bookingCode": "E",
        "cabin": "Economy",
        "fareBasisCode": "ENCWGRDE",
        "fareFamily": "Smart",
        "seatsRemaining": 9,
        "segmentKey": "2f51f155"
       }
      ],
      "terms": {
       "changeable": true,
       "refundable": false,
       "changeFee": {
        "pricing": {
         "display": {
          "amount": 80,
          "currency": "EUR"
         },
         "converted": false
        },
        "applicability": "beforeDeparture",
        "label": "Change fee (before departure)"
       },
       "hasChangeFee": true
      }
     },
     "offers": [
      {
       "offerId": "AwJ2MQAAAABq",
       "expiration": "2026-10-11T11:14:45.438Z",
       "pricing": {
        "display": {
         "total": 467.04,
         "currency": "EUR",
         "base": 332,
         "fees": 0,
         "taxes": 135.04,
         "perPassenger": {
          "adult": {
           "base": 166,
           "currency": "EUR",
           "fees": 0,
           "taxes": 67.52,
           "total": 233.52
          },
          "child": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          },
          "infant": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          }
         }
        },
        "converted": false
       },
       "baggage": {
        "hasCarryOnBag": true,
        "hasCheckedBag": true,
        "included": [
         {
          "bagType": "cabin",
          "description": "Cabin bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 8
         },
         {
          "bagType": "checked",
          "description": "Checked bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 23
         }
        ]
       },
       "fare": {
        "family": "Smart",
        "mixedCabin": false,
        "mixedFareFamily": false,
        "seatsRemaining": 9
       },
       "segmentFares": [
        {
         "bookingCode": "E",
         "cabin": "Economy",
         "fareBasisCode": "ENCWGRDE",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "5d5d3f55"
        },
        {
         "bookingCode": "E",
         "cabin": "Economy",
         "fareBasisCode": "ENCWGRDE",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "2f51f155"
        }
       ],
       "terms": {
        "changeable": true,
        "refundable": false,
        "changeFee": {
         "pricing": {
          "display": {
           "amount": 80,
           "currency": "EUR"
          },
          "converted": false
         },
         "applicability": "beforeDeparture",
         "label": "Change fee (before departure)"
        },
        "hasChangeFee": true
       }
      },
      {
       "offerId": "AwJ2MQAAAABq",
       "expiration": "2026-10-11T11:14:53.592Z",
       "pricing": {
        "display": {
         "total": 707.04,
         "currency": "EUR",
         "base": 572,
         "fees": 0,
         "taxes": 135.04,
         "perPassenger": {
          "adult": {
           "base": 286,
           "currency": "EUR",
           "fees": 0,
           "taxes": 67.52,
           "total": 353.52
          },
          "child": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          },
          "infant": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          }
         }
        },
        "converted": false
       },
       "baggage": {
        "hasCarryOnBag": true,
        "hasCheckedBag": true,
        "included": [
         {
          "bagType": "checked",
          "description": "Checked bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "size": "62LI 158LCM",
          "unit": "kg",
          "weightKg": 23
         },
         {
          "bagType": "cabin",
          "description": "Cabin bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "size": "46LI 118LCM",
          "unit": "kg",
          "weightKg": 8
         }
        ]
       },
       "fare": {
        "family": "Smart",
        "mixedCabin": false,
        "mixedFareFamily": false,
        "seatsRemaining": 9
       },
       "segmentFares": [
        {
         "bookingCode": "X",
         "cabin": "Economy",
         "fareBasisCode": "XNCWGRDE",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "5d5d3f55"
        },
        {
         "bookingCode": "X",
         "cabin": "Economy",
         "fareBasisCode": "XNCWGRDE",
         "fareFamily": "Smart",
         "seatsRemaining": 9,
         "segmentKey": "2f51f155"
        }
       ],
       "terms": {
        "changeable": true,
        "refundable": false,
        "changeFee": {
         "pricing": {
          "display": {
           "amount": 80,
           "currency": "EUR"
          },
          "converted": false
         },
         "applicability": "beforeDeparture",
         "label": "Change fee"
        },
        "hasChangeFee": true
       }
      },
      {
       "offerId": "AwJ2MQAAAABq",
       "expiration": "2026-10-11T11:14:45.439Z",
       "pricing": {
        "display": {
         "total": 2003.04,
         "currency": "EUR",
         "base": 1868,
         "fees": 0,
         "taxes": 135.04,
         "perPassenger": {
          "adult": {
           "base": 934,
           "currency": "EUR",
           "fees": 0,
           "taxes": 67.52,
           "total": 1001.52
          },
          "child": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          },
          "infant": {
           "base": 0,
           "currency": "EUR",
           "fees": 0,
           "taxes": 0,
           "total": 0
          }
         }
        },
        "converted": false
       },
       "baggage": {
        "hasCarryOnBag": true,
        "hasCheckedBag": true,
        "included": [
         {
          "bagType": "cabin",
          "description": "Cabin bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 8
         },
         {
          "bagType": "checked",
          "description": "Checked bag",
          "passengerType": "ALL",
          "pieces": 1,
          "pricing": {
           "display": {
            "amount": 0,
            "currency": "EUR"
           },
           "converted": false
          },
          "unit": "kg",
          "weightKg": 23
         }
        ]
       },
       "fare": {
        "family": "Smart Flex",
        "mixedCabin": false,
        "mixedFareFamily": false,
        "seatsRemaining": 9
       },
       "segmentFares": [
        {
         "bookingCode": "I",
         "cabin": "Economy",
         "fareBasisCode": "IFLEXWG",
         "fareFamily": "Smart Flex",
         "seatsRemaining": 9,
         "segmentKey": "5d5d3f55"
        },
        {
         "bookingCode": "I",
         "cabin": "Economy",
         "fareBasisCode": "IFLEXWG",
         "fareFamily": "Smart Flex",
         "seatsRemaining": 9,
         "segmentKey": "2f51f155"
        }
       ],
       "terms": {
        "changeable": true,
        "refundable": true
       }
      }
     ],
     "isCheapest": true,
     "journeyKey": "66f9cd55184bf10d",
     "legDurations": [
      {
       "dayChange": 0,
       "direction": "OUTBOUND",
       "duration": {
        "iso8601": "PT3H",
        "minutes": 180
       },
       "overnightFlight": false
      },
      {
       "dayChange": 0,
       "direction": "INBOUND",
       "duration": {
        "iso8601": "PT2H35M",
        "minutes": 155
       },
       "overnightFlight": false
      }
     ],
     "parameters": {
      "adults": 0,
      "children": 0,
      "infants": 0
     },
     "segments": [
      {
       "arrivalTime": "2027-05-12T16:25:00",
       "carrier": {
        "marketingCode": "EW",
        "marketingLogo": "https://assets.nuitee.flights/static/images/airlines/EW.png",
        "marketingName": "Eurowings",
        "operatingCode": "EW",
        "operatingName": "Eurowings"
       },
       "departureTime": "2027-05-12T14:25:00",
       "originCode": "STR",
       "destinationCode": "LIS",
       "direction": "OUTBOUND",
       "duration": {
        "iso8601": "PT3H",
        "minutes": 180
       },
       "flight": {
        "marketingNumber": "2604",
        "operatingNumber": "2604"
       },
       "segmentKey": "5d5d3f55",
       "originName": "Stuttgart Airport",
       "destinationName": "Lisbon Humberto Delgado Airport",
       "stopCount": 0
      },
      {
       "arrivalTime": "2027-05-19T11:50:00",
       "carrier": {
        "marketingCode": "EW",
        "marketingLogo": "https://assets.nuitee.flights/static/images/airlines/EW.png",
        "marketingName": "Eurowings",
        "operatingCode": "EW",
        "operatingName": "Eurowings"
       },
       "departureTime": "2027-05-19T08:15:00",
       "originCode": "OPO",
       "destinationCode": "STR",
       "direction": "INBOUND",
       "duration": {
        "iso8601": "PT2H35M",
        "minutes": 155
       },
       "flight": {
        "marketingNumber": "2713",
        "operatingNumber": "2713"
       },
       "segmentKey": "2f51f155",
       "originName": "Francisco de Sá Carneiro Airport",
       "destinationName": "Stuttgart Airport",
       "stopCount": 0
      }
     ],
     "timestamp": "2026-10-11T11:04:45.438Z",
     "totalDuration": {
      "iso8601": "PT5H35M",
      "minutes": 335
     }
    }
   ]
  }
 ]
}
""";
}
