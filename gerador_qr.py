import qrcode

data = "2@hK/vl+wdmg4SM1ONpusQ81ctpao6L21RdWCUyH6G+EHZ/bgwhIxwhuzVNSbHCXtDGrwCOXTDPciA+4Llh3Q3fxMwidG5Y8mi3wg=,dLjRolUKH4JQZ2YUS+H/f2tQF8V2Z3J0oB5EMvAdokA=,R5UTMHw+8PkbdFrcKR2DkLQyU7EKsiqQD+sztXbOsTA=,4cuoyoULmeArtNkbVc7GDfHMvK3gzFSygSchNXN6tcA=,1"

qr = qrcode.QRCode(
    version=1,
    error_correction=qrcode.constants.ERROR_CORRECT_L,
    box_size=10,
    border=4,
)
qr.add_data(data)
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save("codigo_solano.png")
print("QR Code gerado com sucesso: codigo_solano.png")