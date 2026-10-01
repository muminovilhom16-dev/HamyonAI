// Holdout set: written before measuring and NEVER used to tune dictionaries.
// Its numbers are the honest estimate of real-world accuracy.
export const HOLDOUT = String.raw`
# uz_latn
ishga taksi 22 ming | 22000 | expense | transport
uyga taksida keldim 31 ming | 31000 | expense | transport
mytaxi 17 ming | 17000 | expense | transport
avtobusga 1400 | 1400 | expense | transport
benzin 92 ga 300 ming | 300000 | expense | transport
mashina moykasi 35 ming | 35000 | expense | transport
havasdan 64 ming | 64000 | expense | food
magnitdan sut non 23 ming | 23000 | expense | food
bozordan meva-cheva 90 ming | 90000 | expense | food
tuxum 25 ming | 25000 | expense | food
un 10 kilo 85 ming | 85000 | expense | food
yog' 2 litr 48 ming | 48000 | expense | food
qatiq 9 ming | 9000 | expense | food
pishloq 55 ming | 55000 | expense | food
oqtepa lavashdan 65 ming | 65000 | expense | cafe
kfc 89 ming | 89000 | expense | cafe
choyxonada osh 70 ming | 70000 | expense | cafe
kechki ovqat restoranda 380 ming | 380000 | expense | cafe
kofe olib ketdim 26 ming | 26000 | expense | cafe
gaz uchun 70 ming | 70000 | expense | utilities
elektr energiya 160 ming | 160000 | expense | utilities
issiqlik puli 210 ming | 210000 | expense | utilities
uy ijarasi 3.5 mln | 3500000 | expense | housing
mebel 2 mln | 2000000 | expense | housing
uzmobile 40 ming | 40000 | expense | telecom
internet oylik 120 ming | 120000 | expense | telecom
telefon ekrani almashtirish 450 ming | 450000 | expense | tech_services
noutbukka windows qo'yish 80 ming | 80000 | expense | tech_services
kompyuter ta'mirlash 200 ming | 200000 | expense | tech_services
tish davolash 600 ming | 600000 | expense | health
klinikada analiz 180 ming | 180000 | expense | health
vitamin dorixonadan 95 ming | 95000 | expense | health
qishki kurtka 900 ming | 900000 | expense | clothing
oyoq kiyim 400 ming | 400000 | expense | clothing
jinsi shim 300 ming | 300000 | expense | clothing
ingliz tili kursi 700 ming | 700000 | expense | education
universitet kontrakt to'lovi 9 mln | 9000000 | expense | education
bolalarga o'yinchoq 120 ming | 120000 | expense | kids
bog'chaga to'lov 950 ming | 950000 | expense | kids
do'stimning to'yiga 1 mln | 1000000 | expense | celebrations
onamga sovg'a 400 ming | 400000 | expense | celebrations
kredit 1 mln 300 ming | 1300000 | expense | loans
uzum nasiya to'lovi 350 ming | 350000 | expense | loans
kinoga 2 ta bilet 90 ming | 90000 | expense | entertainment
playstation o'yin 300 ming | 300000 | expense | entertainment
sartaroshga 50 ming | 50000 | expense | -
sport zal abonement 400 ming | 400000 | expense | -

# formats
non 3500 | 3500 | expense | food
taksi 15.5k | 15500 | expense | transport
ijara 3 million | 3000000 | expense | housing
kurtka 75 dollar | 75 | expense | clothing
krossovka $120 | 120 | expense | clothing
benzin 1 mln | 1000000 | expense | transport
kafe to'rt yuz ming | 400000 | expense | cafe
taksi o'ttiz ming | 30000 | expense | transport
gaz yetmish ming | 70000 | expense | utilities

# uz_cyrl
таксида 27 минг | 27000 | expense | transport
бозорга 180 минг кетди | 180000 | expense | food
дори 40 минг | 40000 | expense | health
ижара 3 млн | 3000000 | expense | housing
кийим 450 минг | 450000 | expense | clothing
ойлик 6 млн тушди | 6000000 | income | salary
нон беш минг | 5000 | expense | food

# ru
такси до работы 28к | 28000 | expense | transport
бензин 300 тыс | 300000 | expense | transport
продукты в корзинке 230к | 230000 | expense | food
ужин в ресторане 400 тысяч | 400000 | expense | cafe
коммунальные 350к | 350000 | expense | utilities
мобильная связь 50к | 50000 | expense | telecom
лекарства 120 тыс | 120000 | expense | health
обувь 700к | 700000 | expense | clothing
детский сад 900 тыс | 900000 | expense | kids
свадьба 2 млн | 2000000 | expense | celebrations
ипотека 5 млн | 5000000 | expense | loans
концерт 250к | 250000 | expense | entertainment
стрижка 60к | 60000 | expense | -
зарплата пришла 11 млн | 11000000 | income | salary

# mixed / typos
taksi 30 тыс | 30000 | expense | transport
такси 30 ming | 30000 | expense | transport
benzinga 150к | 150000 | expense | transport
dorixonaga 50k | 50000 | expense | health
kofe 25 тысяч | 25000 | expense | cafe
taksy 20 ming | 20000 | expense | transport
gosht 100 minng | 100000 | expense | food

# multiple
non 4 ming, tuxum 25 ming, sut 15 ming | 4000+25000+15000 | expense | food
taksi 20 ming, tushlik 50 ming | 20000+50000 | expense | -
хлеб 5к, сыр 60к | 5000+60000 | expense | food

# income
oyligim tushdi 7.5 mln | 7500000 | income | salary
+300 ming | 300000 | income | other_income
bonus tushdi 500 ming | 500000 | income | other_income
премия 1 млн | 1000000 | income | other_income

# debts
Jamshidga 400 ming qarz berdim | 400000 | debt_given | -
opamdan 1 mln qarz oldim | 1000000 | debt_taken | -
Jamshid 200 ming qaytardi | 200000 | debt_return | -
akamga 500 ming qarzni qaytardim | 500000 | debt_return | -
Bobur akaga 2 mln qarz berdim | 2000000 | debt_given | -

# voice transcripts
taksi uchun o'ttiz besh ming to'ladim | 35000 | expense | transport
kafeda yuz yigirma ming ketdi | 120000 | expense | cafe
bozordan yuz ming lik xarid qildim | 100000 | expense | food
dorixonadan ellik ming lik dori oldim | 50000 | expense | health

# no amount
bozorga bordim | | expense | -
kafega borish kerak | | expense | -
3 ta tuxum | | expense | -
ertaga to'lov qilaman | | expense | -
rahmat | | expense | -
`;
