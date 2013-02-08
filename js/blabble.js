var blabblePhone = null;

var pluginTimeout = setTimeout(function() {
	alert("Unable to load Blabble plugin.");
}, 1000);

//Grab the plugin object as soon as it loads.
function phoneOnLoad(plugin) {
	clearTimeout(pluginTimeout);
	if (!plugin.valid) {
		alert("Plugin error: " + plugin.error);
		return;
	}
	blabblePhone = plugin;
}

//Keep us from polluting Window
(function() {
	//Some variables to keep track of jQuery objects
	var dialBox, callInfo, status,
		//Here we keep track of the account object and if we are registered.
		currentRegistration = {
			account: null,
			activeCall: null,
			incomingCall: null,
			heldCall: null,
			registered: false
		};
		
	window.currentRegistration = currentRegistration;
	//Wire up the DOM
	$(function() {
		dialBox = $("#dialBox");
		callInfo = $("#callInfo");
		status = $("#status");
		
		//Wire up the connect button
		$("#connect").on("click", doConnect);
		
		//Wire up the disconnect button
		$("#disconnect").on("click", doDisconnect);
		
		//Prevent dial pad from hiding when a button is clicked.
		$(".dial-pad").on("click", function() {
			return false;
		});
		
		$("#dial").on("click", doDial);
		$("#hangup").on("click", doHangup);
		
		//Handle dial pad button
		$("[id^=dial-]").on("click", handleDialPad);
		
		//When on a call, handle entry into the dial input as DTMF if we can
		dialBox.on("keypress", function(e) {
			var key = String.fromCharCode(e.which);
			if (/[0-9#\*]/.test(key)) {
				handleDtmfIfNeeded(key);
			}
		//The following is just some stuff to force entry into the end of the
		//dial box if we are on a call.
		}).on("click select", function() {
			//Force the cursor to the end of the box anytime they click in it while on a call
			if (currentRegistration.registered && currentRegistration.activeCall && 
					currentRegistration.activeCall.valid) {
				var len = dialBox.val().length;
				dialBox[0].setSelectionRange(len, len);
			}
		}).on("keydown", function(e) {
			//Ignore left arrow when on a call.
			if (e.which == 37 && currentRegistration.registered && 
					currentRegistration.activeCall && 
					currentRegistration.activeCall.valid) {
				return false;
			}
		});
		
		//Handle buttons on the incoming call dialog
		$("#rejectIncoming").on("click", rejectIncomingCall);
		$("#answerIncoming").on("click", answerIncomingCall);
	});
	
	//This will attempt to create a new account using the provided server
	//and authentication information.
	function doConnect() {
		status.text("Connecting...");
		$("#connectionInfo").slideUp();
		$("#disconnectBlock").show();
		dialBox.focus();
		
		//Create an account object using the form values.
		currentRegistration.account = blabblePhone.createAccount(
			//Setup the host and u/p variables along with event callbacks
			{
				host: $("#server").val(),
				username: $("#user").val(),
				password: $("#pass").val(),
				onIncomingCall: handleIncomingCall,
				onRegState: handleRegState
			});
		
		return false;
	}
	
	//Disconnect and unregister from the SIP server.
	function doDisconnect() {
		if (currentRegistration.account) {
			currentRegistration.account.destroy();
			currentRegistration.account = null;
			currentRegistration.registered = false;
		}
		
		status.text("Not Connected");
		$(".softphone").slideUp();
		$("#disconnectBlock").hide();
		$("#connectionInfo").slideDown();
		
		return false;
	}
	
	//Attempt to create a new call with the contents of the dialBox.
	function doDial() {
		if ($(this).prop('disabled')) return false;
		
		if (!currentRegistration.registered) return false;
		
		var call = currentRegistration.account.makeCall(
			//Here we setup the callbacks for the call
			{
				destination: dialBox.val(),
				onCallRinging: function(call) {
					callInfo.text("Ringing...");
				},
				onCallConnected: function(call) {
					callInfo.text("Connected to: " + call.callerId);
				},
				onCallEnd: handleCallEnd
			});
			
		//If we fail to even dial the call, call.valid will be false
		if (!call.valid) {
			alert("Call failed: " + call.error);
			doHangup();
			return false;
		}
		
		//Keep track of this call so we can hang it up if needed
		currentRegistration.activeCall = call;
		stateOnCall();
		
		return false;
	}
	
	//Hangup the call and cleanup the GUI
	function doHangup() {
		if ($(this).prop('disabled')) return false;
		
		if (!currentRegistration.registered) return false;
		
		if (currentRegistration.activeCall && currentRegistration.activeCall.valid) {
			currentRegistration.activeCall.hangup();
		} else {
			stateOffCall();
		}
		
		return false;
	}
	
	//Called when the remote end disconnects a call
	function handleCallEnd(call, err) {
		currentRegistration.activeCall = null;
		callInfo.text("");
		if (err) {
			alert("A call error occurred: " + err);
		}
		stateOffCall();
	}
	
	//Handle button presses from the popout dialpad
	function handleDialPad() {
		var el = $(this);
		var id = el.attr('id').substr(5);
		if (id == "star") {
			id = "*";
		} else if (id == "pound") {
			id = "#";
		}
		dialBox.val(dialBox.val() + id);
		
		//If we are on a call, we want to sent the DTMF for the button
		handleDtmfIfNeeded(id);
		
		return false;
	}
	
	//Send a DTMF iff we are actually on an active call
	function handleDtmfIfNeeded(digit) {
		if (currentRegistration.registered && currentRegistration.activeCall && 
				currentRegistration.activeCall.valid) {
			currentRegistration.activeCall.sendDTMF(digit);
		}
	}
	
	//Occurs when we fail to answer/reject the call in time.
	function handleIncomingCallStopped()
	{
		currentRegistration.incomingCall = null;
		$("#incomingCall").modal("hide");
	}
	
	function answerIncomingCall()
	{
		//Keep track of the call on our side.
		var call = currentRegistration.incomingCall;
		currentRegistration.incomingCall = null;
		currentRegistration.activeCall = call;
		
		//Answer the call, establishing audio
		call.answer();
		//Setup the event handler to capture when the call ends
		call.onCallEnd = handleCallEnd;
		stateOnCall();
		
		callInfo.text("Connected to: " + call.callerId);
		$("#incomingCall").modal("hide");
		
		return false;
	}
	
	function rejectIncomingCall()
	{
		//Hangup will send a 483/Busy response
		currentRegistration.incomingCall.hangup();
		currentRegistration.incomingCall = null;
		
		$("#incomingCall").modal("hide");
		
		return false;
	}
	
	//This is called when we first register and every reregister or if an error occurs.
	function handleRegState(account, statusCode) {
		if (statusCode == 200) {
			status.text("Registered");
			if (!currentRegistration.registered) {
				currentRegistration.registered = true;
				$(".softphone").slideDown();
			}
		} else {
			//No real error handling in this example. Ideally
			//responses such as 403 should be translated into
			//their proper meaning.
			status.text(statusCode);
			if (currentRegistration.registered) {
				currentRegistration.registered = false;
				$(".softphone").slideUp();
			}
		}
	}

	//Popup a dialog when we are getting an incoming call.
	function handleIncomingCall(call, account) {
		call.onCallEnd = handleIncomingCallStopped;
		currentRegistration.incomingCall = call;
		$("#incomingCID").text(call.callerId);
		$("#incomingCall").modal("show");
	}

	//DOM manipulation
	
	function stateOnCall() {
		$("#dial").hide();
		$("#hangup").show();
	}

	function stateOffCall() {
		$("#dial").show();
		$("#hangup").hide();
	}
})();