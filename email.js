function sendmail(){
    let parms ={
      name:document.getElementById("name").value,
      emailaddress:document.getElementById("email").value,
      phone:document.getElementById("phone").value,
      subject:document.getElementById("subject").value,
      Message:document.getElementById("message").value,

    }

    emailjs.send("service_6xjt3wv","template_ok7cjlv",parms).then(function(res){
        console.log("Email sent successfully!", res);
    });
}